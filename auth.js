document.addEventListener('DOMContentLoaded', () => {
    checkAlreadyLoggedIn();
    setupPasswordToggles();
    setupLoginForm();
    setupRegisterForm();
});

async function checkAlreadyLoggedIn() {
    try {
        const response = await fetch('/api/auth/me', { credentials: 'include' });
        if (response.ok) {
            window.location.replace('index.html');
        }
    } catch (e) {
        // Not logged in or network error, stay on auth page
    }
}

function setupPasswordToggles() {
    const bindToggle = (btnId, inputId, iconId) => {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        const icon = document.getElementById(iconId);

        if (btn && input && icon) {
            btn.addEventListener('click', () => {
                const isPassword = input.type === 'password';
                input.type = isPassword ? 'text' : 'password';
                icon.className = isPassword ? 'bi bi-eye-slash' : 'bi bi-eye';
            });
        }
    };

    bindToggle('togglePasswordBtn', 'loginPassword', 'togglePasswordIcon');
    bindToggle('toggleRegPasswordBtn', 'regPassword', 'toggleRegPasswordIcon');
    bindToggle('toggleConfirmPasswordBtn', 'regConfirmPassword', 'toggleConfirmPasswordIcon');
}

function showAlert(message, type = 'danger') {
    const alertBox = document.getElementById('alertMessage');
    if (!alertBox) return;

    alertBox.className = `alert alert-${type} py-2 px-3 small mb-3`;
    alertBox.textContent = message;
    alertBox.classList.remove('d-none');
}

function hideAlert() {
    const alertBox = document.getElementById('alertMessage');
    if (alertBox) {
        alertBox.classList.add('d-none');
    }
}

function setupLoginForm() {
    const form = document.getElementById('loginForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const email = document.getElementById('loginEmail').value.trim();
        const password = document.getElementById('loginPassword').value;
        const submitBtn = document.getElementById('loginSubmitBtn');
        const spinner = document.getElementById('loginSpinner');

        if (!email || !password) {
            showAlert('Please enter both email and password.');
            return;
        }

        submitBtn.disabled = true;
        spinner.classList.remove('d-none');

        try {
            const response = await fetch('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ email, password })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showAlert('Login successful! Redirecting...', 'success');
                setTimeout(() => {
                    window.location.href = 'index.html';
                }, 600);
            } else {
                showAlert(data.message || 'Invalid email or password.');
                submitBtn.disabled = false;
                spinner.classList.add('d-none');
            }
        } catch (error) {
            console.error('Login error:', error);
            showAlert('Network error. Please make sure the backend server is running.');
            submitBtn.disabled = false;
            spinner.classList.add('d-none');
        }
    });
}

function setupRegisterForm() {
    const form = document.getElementById('registerForm');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        hideAlert();

        const name = document.getElementById('regName').value.trim();
        const email = document.getElementById('regEmail').value.trim();
        const password = document.getElementById('regPassword').value;
        const confirmPassword = document.getElementById('regConfirmPassword').value;
        const submitBtn = document.getElementById('registerSubmitBtn');
        const spinner = document.getElementById('registerSpinner');

        if (!name || !email || !password || !confirmPassword) {
            showAlert('All fields are required.');
            return;
        }

        if (name.length < 2) {
            showAlert('Full name must be at least 2 characters.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showAlert('Please enter a valid email address.');
            return;
        }

        if (password.length < 6) {
            showAlert('Password must be at least 6 characters long.');
            return;
        }

        if (password !== confirmPassword) {
            showAlert('Passwords do not match. Please re-enter.');
            return;
        }

        submitBtn.disabled = true;
        spinner.classList.remove('d-none');

        try {
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, email, password, confirmPassword })
            });

            const data = await response.json();

            if (response.ok && data.success) {
                showAlert('Account registered successfully! Redirecting to login...', 'success');
                form.reset();
                setTimeout(() => {
                    window.location.href = 'login.html';
                }, 1500);
            } else {
                showAlert(data.message || 'Registration failed. Please try again.');
                submitBtn.disabled = false;
                spinner.classList.add('d-none');
            }
        } catch (error) {
            console.error('Registration error:', error);
            showAlert('Network error. Please make sure the backend server is running.');
            submitBtn.disabled = false;
            spinner.classList.add('d-none');
        }
    });
}
