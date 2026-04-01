from flask import Flask, render_template, request, jsonify
from google import genai
from pypdf import PdfReader
from pdfminer.high_level import extract_text as pdfminer_extract
import io
import os

app = Flask(__name__)

# HARDCODED AS REQUESTED (for demo only)
API_KEY = "AIzaSyAoXEO6rg5VP9sMp7Saj-lM2NNxHUPqAmE"

# Initialize the Gemini Client
client = genai.Client(api_key=API_KEY)

# In-memory PDF context — cleared on every server start (no stale data)
PDF_CONTEXT = ""

def save_context(text):
    """Optionally persist context to disk (for debugging only)."""
    with open(".context_cache.txt", "w", encoding="utf-8") as f:
        f.write(text)

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/upload", methods=["POST"])
def upload_pdf():
    global PDF_CONTEXT
    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400

    if file and file.filename.endswith('.pdf'):
        try:
            print(f"DEBUG: Starting robust extraction for: {file.filename}")
            file_bytes = file.read()
            
            # 1. First attempt: pypdf (fast)
            text = []
            try:
                reader = PdfReader(io.BytesIO(file_bytes))
                for page in reader.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text.append(extracted)
            except Exception as e:
                print(f"DEBUG: pypdf extraction failed or partial error: {e}")

            extracted_text = "\n".join(text)

            # 2. Fallback: pdfminer.six (very robust) if first attempt gets too little
            if len(extracted_text.strip()) < 50:
                print("DEBUG: pypdf returned minimal text. Falling back to pdfminer.six...")
                extracted_text = pdfminer_extract(io.BytesIO(file_bytes))

            if not extracted_text.strip():
                return jsonify({"error": "Failed to extract readable text. The PDF might be image-only (scanned). Please use a text-based PDF."}), 400
            
            PDF_CONTEXT = extracted_text
            save_context(PDF_CONTEXT)
            
            print(f"DEBUG: Final extraction success. Length: {len(PDF_CONTEXT)} characters.")
            
            return jsonify({
                "message": f"Successfully indexed {file.filename}",
                "char_count": len(PDF_CONTEXT),
            })
        except Exception as e:
            print(f"ERROR: General PDF processing failure: {str(e)}")
            return jsonify({"error": f"Internal PDF error: {str(e)}"}), 500
    
    return jsonify({"error": "Invalid file type. Please upload a PDF."}), 400

@app.route("/clear_context", methods=["POST"])
def clear_context():
    global PDF_CONTEXT
    PDF_CONTEXT = ""
    cache_path = ".context_cache.txt"
    if os.path.exists(cache_path):
        os.remove(cache_path)
    return jsonify({"message": "Context cleared successfully."})

@app.route("/chat", methods=["POST"])
def chat():
    data = request.json
    user_prompt = data.get("prompt", "")
    
    if not user_prompt:
        return jsonify({"error": "No prompt provided"}), 400

    # Use only in-memory context — never read from disk here
    current_context = PDF_CONTEXT

    try:
        final_prompt = user_prompt

        if current_context.strip():
            # PDF is uploaded — answer using document context
            final_prompt = (
                "You are a helpful AI assistant tasked with analyzing an uploaded document. "
                "You have been provided with the full text of a PDF file below. "
                "Use the provided document context to formulate accurate answers to the user's question. "
                "--- CONTEXT RULES ---\n"
                "1. Prioritize information from the context below.\n"
                "2. If the answer is in the document, describe it clearly.\n"
                "3. If the answer is NOT in the document, answer based on your general knowledge but clarify it's not in the file.\n"
                "4. Be concise and professional.\n\n"
                f"--- DOCUMENT CONTEXT ---\n{current_context}\n--- END OF CONTEXT ---\n\n"
                f"USER QUESTION: {user_prompt}"
            )
        else:
            # No PDF uploaded — answer as a general AI chatbot
            final_prompt = (
                "You are Jahnavi, a friendly and helpful AI assistant. "
                "Answer the user's question clearly and concisely based on your general knowledge.\n\n"
                f"USER: {user_prompt}"
            )

        # Call the gemini-2.5-flash model
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=final_prompt
        )
        return jsonify({"response": response.text})
    except Exception as e:
        error_str = str(e)
        print(f"Error generating content: {error_str}")
        # Provide user-friendly messages for common errors
        if '429' in error_str or 'RESOURCE_EXHAUSTED' in error_str or 'quota' in error_str.lower():
            return jsonify({"error": "⚠️ API quota limit reached. The free-tier request limit has been exceeded. Please wait a moment and try again, or check your API plan."}), 429
        elif '401' in error_str or 'API_KEY_INVALID' in error_str or 'UNAUTHENTICATED' in error_str:
            return jsonify({"error": "🔑 Invalid API key. Please check your Gemini API key configuration."}), 401
        elif '503' in error_str or 'UNAVAILABLE' in error_str:
            return jsonify({"error": "🔌 The AI service is temporarily unavailable. Please try again in a few seconds."}), 503
        else:
            return jsonify({"error": f"An error occurred: {error_str}"}), 500

if __name__ == "__main__":
    app.run(debug=True, port=5000)
