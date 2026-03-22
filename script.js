document.addEventListener('DOMContentLoaded', () => {
    // --- Selectors ---
    const loader = document.getElementById('app-loader');
    const toastContainer = document.getElementById('toast-container');
    const balanceElement = document.getElementById('balance-amount');
    const themeToggle = document.getElementById('theme-toggle');
    
    // Purchase Modals Elements
    const starsAmount = document.getElementById('stars-amount');
    const starsTotal = document.getElementById('stars-total');
    const starsUser = document.getElementById('stars-username');
    const premiumUser = document.getElementById('premium-username');
    const premiumTotal = document.getElementById('premium-total');

    // Display Containers
    const starsDisplayContainer = document.getElementById('stars-display-container');
    const premiumDisplayContainer = document.getElementById('premium-display-container');

    // --- Data Storage ---
    let userData = null;
    const premiumPrices = { '3': 190000, '6': 350000, '12': 600000 };

    // --- Initialization ---
    const urlParams = new URLSearchParams(window.location.search);
    const userId = urlParams.get('user_id');

    async function init() {
        // showLoader(); // Disabled as per user request
        await Promise.all([
            fetchUserData(),
            fetchLeaderboard('weekly', false) 
        ]);
        setTimeout(hideLoader, 500);

        // Handle Deep Linking
        const tab = urlParams.get('tab');
        if (tab === 'history') openModal('history');
        if (tab === 'deposit') openModal('profile');
    }

    function showLoader() { if (loader) loader.classList.remove('hidden'); }
    function hideLoader() { if (loader) loader.classList.add('hidden'); }

    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icon = type === 'success' ? 'fa-check-circle' : (type === 'error' ? 'fa-exclamation-circle' : 'fa-info-circle');
        toast.innerHTML = `<i class="fas ${icon}"></i> <span>${message}</span>`;
        toastContainer.appendChild(toast);
        
        // Haptic Feedback
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred(type === 'error' ? 'error' : 'success');
        }

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(-10px) scale(0.9)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // --- API Calls ---
    async function fetchUserData() {
        try {
            const endpoint = userId ? `/api/user?user_id=${userId}` : '/api/user';
            const response = await fetch(endpoint);
            userData = await response.json();
            updateUI();
            updateReferralLink();
            
            // Initial calculation once data is here
            calculateStars();
            calculatePremium();
        } catch (error) {
            console.error('Error fetching user:', error);
        }
    }

    function updateUI() {
        if (!userData) return;
        const formatted = new Intl.NumberFormat('uz-UZ').format(userData.balance);
        balanceElement.textContent = `${formatted} ${userData.currency || 'so\'m'}`;
    }

    function updateReferralLink() {
        const banner = document.querySelector('.offers-banner');
        if (banner) {
            banner.onclick = () => openModal('referral');
        }
    }

    function renderReferralData() {
        if (!userData) return;
        const input = document.getElementById('ref-modal-input');
        const count = document.getElementById('ref-modal-count');
        const income = document.getElementById('ref-modal-income');
        
        const refLink = `https://t.me/StarsBazaBot?start=${userData.id}`;
        if (input) input.value = refLink;
        if (count) count.textContent = userData.stats?.referrals || 0;
        if (income) {
            const earned = (userData.stats?.referrals || 0) * 5000; 
            income.textContent = new Intl.NumberFormat('uz-UZ').format(earned) + " so'm";
        }
    }

    // --- Modals Logic ---
    const modals = {
        history: document.getElementById('history-modal'),
        top10: document.getElementById('top10-modal'),
        profile: document.getElementById('profile-modal'),
        stars: document.getElementById('stars-modal'),
        premium: document.getElementById('premium-modal'),
        referral: document.getElementById('referral-modal')
    };

    const navBtns = {
        history: document.getElementById('nav-history'),
        top10: document.getElementById('nav-top10'),
        profile: document.getElementById('nav-profile')
    };

    const modalTriggers = {
        stars: document.querySelector('.stars-card'),
        premium: document.querySelector('.premium-card')
    };

    const closeBtns = {
        history: document.getElementById('close-history'),
        top10: document.getElementById('close-top10'),
        profile: document.getElementById('close-profile'),
        stars: document.getElementById('close-stars'),
        premium: document.getElementById('close-premium'),
        referral: document.getElementById('close-referral')
    };

    function openModal(key) {
        if (!modals[key]) return;
        
        // Haptic Feedback
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
        }

        modals[key].classList.add('active');
        document.body.style.overflow = 'hidden'; // Prevent scroll
        
        if (key === 'history') loadHistory();
        if (key === 'profile') renderProfileData();
        if (key === 'referral') renderReferralData();
        
        if (key === 'stars') calculateStars();
        if (key === 'premium') calculatePremium();
    }

    function closeModal(key) {
        if (!modals[key]) return;
        modals[key].style.opacity = '0';
        setTimeout(() => {
            modals[key].classList.remove('active');
            modals[key].style.opacity = '';
            document.body.style.overflow = '';
        }, 300);
    }

    Object.keys(navBtns).forEach(key => {
        if (navBtns[key]) navBtns[key].addEventListener('click', (e) => { e.preventDefault(); openModal(key); });
    });

    Object.keys(modalTriggers).forEach(key => {
        if (modalTriggers[key]) modalTriggers[key].addEventListener('click', () => openModal(key));
    });

    Object.keys(closeBtns).forEach(key => {
        if (closeBtns[key]) closeBtns[key].addEventListener('click', () => closeModal(key));
    });

    Object.keys(modals).forEach(key => {
        if (modals[key]) {
            modals[key].addEventListener('click', (e) => {
                if (e.target === modals[key]) closeModal(key);
            });
        }
    });

    // --- History Logic ---
    async function loadHistory() {
        const list = document.getElementById('history-list');
        if (!list) return;
        list.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Yuklanmoqda...</p>';
        try {
            const endpoint = userId ? `/api/history?user_id=${userId}` : '/api/history';
            const response = await fetch(endpoint);
            const data = await response.json();
            renderHistory(data);
        } catch (error) {
            list.innerHTML = '<p style="color:red; text-align:center;">Xatolik!</p>';
        }
    }

    function renderHistory(data) {
        const list = document.getElementById('history-list');
        if (!list) return;
        list.innerHTML = '';
        if (data.length === 0) {
            list.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Tarix bo\'sh</p>';
            return;
        }
        data.forEach(item => {
            const div = document.createElement('div');
            div.className = 'history-item';
            const statusClass = item.status === 'Accepted' ? 'status-accepted' : (item.status === 'Rejected' ? 'status-rejected' : 'status-pending');
            const statusText = item.status === 'Accepted' ? 'Qabul' : (item.status === 'Rejected' ? 'Rad' : 'Kutilmoqda');
            div.innerHTML = `
                <div class="history-header">
                    <span class="history-title">${item.title}</span>
                    <span class="status-badge ${statusClass}">${statusText}</span>
                </div>
                <div class="history-details">
                    <span>Miqdor: ${item.amount}</span>
                    <span style="text-align:right">Narx: ${item.price}</span>
                    ${item.reason ? `<div class="reject-reason">Sabab: ${item.reason}</div>` : ''}
                    <div class="history-date">${item.date}</div>
                </div>
            `;
            list.appendChild(div);
        });
    }

    // --- Profile Logic ---
    function renderProfileData() {
        if (!userData) return;
        const avatar = document.getElementById('profile-avatar-letter');
        const name = document.getElementById('profile-name');
        const username = document.getElementById('profile-username');
        const idSpan = document.getElementById('profile-id');
        const mBalance = document.getElementById('modal-balance');
        
        if (avatar) avatar.textContent = userData.username.charAt(0).toUpperCase();
        if (name) name.textContent = userData.username.replace('@', '');
        if (username) username.textContent = userData.username;
        if (idSpan) idSpan.textContent = `ID: ${userData.id}`;
        
        if (mBalance) {
            const formatted = new Intl.NumberFormat('uz-UZ').format(userData.balance);
            mBalance.textContent = `${formatted} ${userData.currency || 'so\'m'}`;
        }
        
        if (document.getElementById('stat-orders')) document.getElementById('stat-orders').textContent = userData.stats?.orders || 0;
        if (document.getElementById('stat-stars')) document.getElementById('stat-stars').textContent = userData.stats?.stars || 0;
        if (document.getElementById('stat-referrals')) document.getElementById('stat-referrals').textContent = userData.stats?.referrals || 0;
        
        // Stars balance display (new)
        if (document.getElementById('stat-stars')) document.getElementById('stat-stars').textContent = userData.stars_balance || 0;
        
        if (document.getElementById('api-token')) document.getElementById('api-token').value = userData.api_token || '---';

        // Withdrawal shortcut (new)
        const statsBox = document.querySelectorAll('.stat-box')[1]; // Stars box
        if (statsBox) {
            statsBox.style.cursor = 'pointer';
            statsBox.onclick = () => {
                const amount = prompt("Yechish uchun Stars miqdorini kiriting (min 50):", "50");
                if (amount && parseInt(amount) >= 50) {
                    const wallet = prompt("Karta raqami yoki Telegram username:");
                    if (wallet) handleWithdraw(amount, wallet);
                }
            };
        }
    }

    // --- Top 10 Logic ---
    const tabBtns = document.querySelectorAll('.tab-btn');
    const leaderboardList = document.getElementById('leaderboard-list');

    async function fetchLeaderboard(period, show = true) {
        if (show && leaderboardList) leaderboardList.innerHTML = '<p style="text-align:center; padding:20px; color:#666;">Yuklanmoqda...</p>';
        try {
            const response = await fetch(`/api/top10?period=${period}`);
            const data = await response.json();
            renderLeaderboard(data);
        } catch (error) {
            if (show && leaderboardList) leaderboardList.innerHTML = '<p style="color:red; text-align:center;">Xatolik!</p>';
        }
    }

    function renderLeaderboard(data) {
        if (!leaderboardList) return;
        leaderboardList.innerHTML = '';
        data.forEach((user, index) => {
            const rank = index + 1;
            const div = document.createElement('div');
            div.className = 'leaderboard-item';
            const starsText = new Intl.NumberFormat('uz-UZ').format(user.stars);
            div.innerHTML = `
                <div class="rank-avatar">${rank}</div>
                <div class="user-info"><h4>${user.username}</h4><p>${user.orders} ta buyurtma</p></div>
                <div class="stars-info"><span class="stars-count">${starsText} ta</span><span class="stars-label">stars</span></div>
            `;
            leaderboardList.appendChild(div);
        });
    }

    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            fetchLeaderboard(btn.dataset.period);
        });
    });

    // --- Purchase Calculators ---
    function calculateStars() {
        if (!starsAmount || !starsDisplayContainer) return 0;
        const amount = parseInt(starsAmount.value) || 0;
        const price = amount * 210;
        const methodBtn = document.querySelector('#stars-modal .method-btn.active');
        const method = methodBtn ? methodBtn.dataset.method : 'card';
        
        const balance = userData ? userData.balance : 0;
        const isError = method === 'balance' && balance < price;
        
        starsDisplayContainer.classList.toggle('error', isError);
        if (isError) {
            starsDisplayContainer.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span style="font-weight:bold;">Mablag' yetarli emas</span>`;
        } else {
            starsDisplayContainer.innerHTML = `<i class="fas fa-calculator"></i> Jami: <span id="stars-total">${new Intl.NumberFormat('uz-UZ').format(price)}</span> so'm`;
        }
        return price;
    }

    function calculatePremium() {
        const activeBtn = document.querySelector('#premium-duration .amount-btn.active');
        if (!activeBtn || !premiumDisplayContainer) return 0;
        const price = premiumPrices[activeBtn.dataset.val];
        const methodBtn = document.querySelector('#premium-modal .method-btn.active');
        const method = methodBtn ? methodBtn.dataset.method : 'card';

        const balance = userData ? userData.balance : 0;
        const isError = method === 'balance' && balance < price;

        premiumDisplayContainer.classList.toggle('error', isError);
        if (isError) {
            premiumDisplayContainer.innerHTML = `<i class="fas fa-exclamation-circle"></i> <span style="font-weight:bold;">Mablag' yetarli emas</span>`;
        } else {
            premiumDisplayContainer.innerHTML = `<i class="fas fa-calculator"></i> Jami: <span id="premium-total">${new Intl.NumberFormat('uz-UZ').format(price)}</span> so'm`;
        }
        return price;
    }

    // Input listeners
    if (starsAmount) starsAmount.addEventListener('input', calculateStars);
    document.querySelectorAll('#stars-quick .amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#stars-quick .amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            starsAmount.value = btn.dataset.val;
            calculateStars();
        });
    });

    document.querySelectorAll('#premium-duration .amount-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#premium-duration .amount-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            calculatePremium();
        });
    });

    // Method selectors
    document.querySelectorAll('.method-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const parent = btn.parentElement;
            parent.querySelectorAll('.method-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const isStars = btn.closest('#stars-modal') !== null;
            if (isStars) calculateStars();
            else calculatePremium();
        });
    });

    // Self-btns
    if (document.getElementById('stars-self')) document.getElementById('stars-self').addEventListener('click', () => {
        if (userData) starsUser.value = userData.username.replace('@', '');
    });
    if (document.getElementById('premium-self')) document.getElementById('premium-self').addEventListener('click', () => {
        if (userData) premiumUser.value = userData.username.replace('@', '');
    });

    // --- Order Processing ---
    document.querySelectorAll('.pay-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
            const isStars = btn.closest('#stars-modal') !== null;
            const modal = isStars ? 'stars' : 'premium';
            const methodBtn = document.querySelector(`#${modal}-modal .method-btn.active`);
            const method = methodBtn ? methodBtn.dataset.method : 'card';
            
            if (method !== 'balance') {
                return showToast('Hozircha faqat shaxsiy balans orqali to\'lash mumkin! 💳', 'info');
            }

            const amountLabel = isStars ? starsAmount.value + ' stars' : document.querySelector('#premium-duration .amount-btn.active').textContent;
            const priceVal = isStars ? (parseInt(starsAmount.value) * 210) : premiumPrices[document.querySelector('#premium-duration .amount-btn.active').dataset.val];

            const payload = {
                user_id: userId,
                type: isStars ? 'Stars buyurtmasi' : 'Premium obuna',
                target_user: document.getElementById(`${modal}-username`).value,
                amount: amountLabel,
                price: priceVal
            };

            if (!payload.target_user) return showToast('Username kiriting!', 'error');
            if (isStars && (!payload.amount || parseInt(payload.amount) <= 0)) return showToast('Stars miqdorini kiriting!', 'error');
            if (!userId) return showToast('Avval botga start bosing!', 'error');
            if (userData && userData.balance < payload.price) return showToast('Mablag\'ingiz yetarli emas! ❌', 'error');

            try {
                const response = await fetch('/api/purchase', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (result.success) {
                    showToast('Buyurtma qabul qilindi! ✅');
                    closeModal(modal);
                    fetchUserData();
                } else {
                    showToast('Xatolik: ' + result.error, 'error');
                }
            } catch (error) { showToast('Tarmoq xatoligi!', 'error'); }
        });
    });

    // --- Theme Toggle ---
    let isDark = true;
    if (themeToggle) {
        themeToggle.addEventListener('click', () => {
            isDark = !isDark;
            document.body.classList.toggle('light-theme', !isDark);
            themeToggle.querySelector('i').className = isDark ? 'fas fa-moon' : 'fas fa-sun';
            
            document.querySelectorAll('.modal-overlay').forEach(modal => {
                modal.style.background = isDark ? 'rgba(0, 0, 0, 0.85)' : 'rgba(255, 255, 255, 0.85)';
            });
        });
    }

    // Referral Modal Listeners
    document.getElementById('ref-modal-copy')?.addEventListener('click', () => {
        const input = document.getElementById('ref-modal-input');
        if (input) {
            input.select();
            navigator.clipboard.writeText(input.value);
            showToast('Havola nusxalandi! ✅');
        }
    });

    document.getElementById('ref-modal-share')?.addEventListener('click', () => {
        const refLink = document.getElementById('ref-modal-input')?.value;
        if (refLink) {
            const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent('Yulduzlar va Premium obuna uchun eng arzon bot!')}`;
            window.open(shareUrl, '_blank');
        }
    });

    async function handleWithdraw(amount, wallet) {
        // Haptic Feedback
        if (window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.HapticFeedback) {
            window.Telegram.WebApp.HapticFeedback.notificationOccurred('success');
        }

        try {
            const res = await fetch('/api/withdraw', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ user_id: userId, amount, wallet })
            });
            const data = await res.json();
            if (data.success) { showToast('Sorov yuborildi! ✅'); fetchUserData(); }
            else { showToast(data.error, 'error'); }
        } catch (e) { showToast('Xatolik!', 'error'); }
    }

    // Start everything
    init();
});
