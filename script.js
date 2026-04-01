// Initialize markdown renderer
const md = window.markdownit ? window.markdownit({ breaks: true, linkify: true }) : null;

document.addEventListener('DOMContentLoaded', () => {
    // Clear PDF context on every page load so new chats are always fresh
    fetch('/clear_context', { method: 'POST' }).catch(() => {});

    // Focus search input on load
    const searchInput = document.querySelector('.search-input');
    if (searchInput) {
        searchInput.focus();
    }

    // Auto-resize textarea
    if (searchInput) {
        searchInput.addEventListener('input', function() {
            this.style.height = '48px';
            this.style.height = (this.scrollHeight) + 'px';
            if(this.value.trim() === '') {
                 this.style.height = '48px';
            }
        });
        
        searchInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                const prompt = this.value.trim();
                if (prompt) {
                    submitPrompt(prompt);
                    this.value = '';
                    this.style.height = '48px';
                }
            }
        });
    }

    // Filter button active states
    const filterBtns = document.querySelectorAll('.filter-btn');
    filterBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            filterBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });

    // Sidebar active states
    const navItems = document.querySelectorAll('.nav-menu .nav-item:not(.search-box)');
    navItems.forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navItems.forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });

    // New Thread button — clear PDF context and reset UI
    const newThreadBtn = document.getElementById('new-thread-btn');
    if (newThreadBtn) {
        newThreadBtn.addEventListener('click', async () => {
            await fetch('/clear_context', { method: 'POST' }).catch(() => {});
            // Hide file badge
            const fileBadge = document.getElementById('file-badge');
            const pdfInput = document.getElementById('pdf-input');
            if (fileBadge) fileBadge.style.display = 'none';
            if (pdfInput) pdfInput.value = '';
            // Reset chat area
            const chatHistory = document.querySelector('.chat-history');
            const suggestionsContainer = document.querySelector('.suggestions-container');
            const logoTitle = document.querySelector('.logo-title');
            if (chatHistory) { chatHistory.innerHTML = ''; chatHistory.style.display = 'none'; }
            if (suggestionsContainer) suggestionsContainer.style.display = '';
            if (logoTitle) logoTitle.style.display = '';
        });
    }
    
    // Chat logic
    const chatHistory = document.querySelector('.chat-history');
    const suggestionsContainer = document.querySelector('.suggestions-container');
    const logoTitle = document.querySelector('.logo-title');
    const submitBtn = document.querySelector('.dark-btn');

    // Click listener for submit button
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const prompt = searchInput.value.trim();
            if (prompt) {
                submitPrompt(prompt);
                searchInput.value = '';
                searchInput.style.height = '48px';
            }
        });
    }

    // Make suggestion items clickable
    const suggestionItems = document.querySelectorAll('.suggestion-item');
    suggestionItems.forEach(item => {
        item.addEventListener('click', () => {
            const text = item.querySelector('span').textContent;
            submitPrompt(text);
        });
    });

    // File Upload logic
    const pdfInput = document.getElementById('pdf-input');
    const attachBtn = document.getElementById('attach-btn');
    const fileBadge = document.getElementById('file-badge');
    const fileNameSpan = fileBadge ? fileBadge.querySelector('.file-name') : null;

    if (attachBtn && pdfInput) {
        attachBtn.addEventListener('click', () => {
            // Reset input so the same file can be uploaded again if needed
            pdfInput.value = '';
            pdfInput.click();
        });
        
        pdfInput.addEventListener('change', async (e) => {
            const file = e.target.files[0];
            if (!file) return;

            // Show temporary loading state in badge
            if (fileBadge && fileNameSpan) {
                fileBadge.style.display = 'flex';
                fileNameSpan.textContent = "Processing PDF...";
                fileBadge.style.opacity = '0.7';
            }

            const formData = new FormData();
            formData.append('file', file);

            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                const data = await response.json();

                if (data.error) {
                    alert(data.error);
                    if (fileBadge) fileBadge.style.display = 'none';
                } else {
                    const count = data.char_count.toLocaleString();
                    if (fileNameSpan) {
                        fileNameSpan.textContent = `${file.name} (${count} characters)`;
                    }
                    fileBadge.style.opacity = '1';
                    console.log("PDF Indexed:", data.char_count, "characters");
                }
            } catch (error) {
                alert("Failed to connect to the server for upload.");
                if (fileBadge) fileBadge.style.display = 'none';
            }
        });

        // Clear Context Logic
        const removeBtn = document.querySelector('.remove-file');
        if (removeBtn) {
            removeBtn.addEventListener('click', async (e) => {
                e.stopPropagation(); // prevent triggering parent clicks
                try {
                    const response = await fetch('/clear_context', { method: 'POST' });
                    if (response.ok) {
                        if (fileBadge) fileBadge.style.display = 'none';
                        pdfInput.value = '';
                    }
                } catch (error) {
                    console.error("Failed to clear context");
                }
            });
        }
    }

    async function submitPrompt(prompt) {
        // Hide logo and suggestions
        if (logoTitle) logoTitle.style.display = 'none';
        if (suggestionsContainer) suggestionsContainer.style.display = 'none';
        
        // Show chat history container
        if (chatHistory) chatHistory.style.display = 'flex';
        
        // Add User message
        appendMessage('user', prompt);
        
        // Show loading state with styled thinking indicator
        const loadingId = appendLoadingMessage();
        
        try {
            const response = await fetch('/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ prompt: prompt })
            });
            const data = await response.json();
            
            // Remove loading state and add actual response
            const loadMsg = document.getElementById(loadingId);
            if(loadMsg) loadMsg.remove();
            
            if(data.error) {
                appendMessage('bot', data.error, true);
            } else {
                appendMessage('bot', data.response);
            }
            
        } catch (error) {
            const loadMsg = document.getElementById(loadingId);
            if(loadMsg) loadMsg.remove();
            appendMessage('bot', '🔌 Failed to connect to server. Make sure the Flask app is running.', true);
        }
    }
    
    function appendLoadingMessage() {
        const msgDiv = document.createElement('div');
        msgDiv.className = 'chat-message bot-message thinking-message';
        msgDiv.innerHTML = '<span class="thinking-dots">Thinking<span>.</span><span>.</span><span>.</span></span>';
        const msgId = 'msg-' + Date.now() + Math.floor(Math.random() * 100);
        msgDiv.id = msgId;
        if (chatHistory) {
            chatHistory.appendChild(msgDiv);
            msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        return msgId;
    }

    function appendMessage(sender, text, isError = false) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `chat-message ${sender}-message${isError ? ' error-message' : ''}`;
        
        if (sender === 'bot' && md) {
            // Render markdown for bot messages
            msgDiv.innerHTML = md.render(text);
        } else {
            // Plain text for user messages (safe from XSS)
            msgDiv.textContent = text;
        }
        
        const msgId = 'msg-' + Date.now() + Math.floor(Math.random() * 100);
        msgDiv.id = msgId;
        
        if (chatHistory) {
            chatHistory.appendChild(msgDiv);
            // Scroll to newly added message smoothly
            msgDiv.scrollIntoView({ behavior: 'smooth', block: 'end' });
        }
        
        return msgId;
    }
});
