
const firebaseConfig = {
    apiKey: "",
    authDomain: "",
    projectId: "",
    storageBucket: "",
    messagingSenderId: "",
    appId: "",
    measurementId: ""
};

// Initialize Firebase
const app = firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const googleProvider = new firebase.auth.GoogleAuthProvider();
let currentUser = null;

const HISTORY_KEY_GUEST = 'goldCalcHistory_GUEST';
const CACHED_PRICES_KEY = 'goldCalcCachedPrices';
const MAX_HISTORY_ITEMS = 7;
const MESGHAL_TO_GRAM = 4.6083;
const REFRESH_INTERVAL = 10 * 60 * 1000;
const RETRY_INTERVAL = 30 * 1000;

let lastUpdateTime = null;
let priceUpdateInterval = null;
let countdownInterval = null;
let retryTimeout = null;
let retryCountdownInterval = null;

const CURRENCY_INFO = {
    'دلار آمریکا': { id: '137203', name: 'دلار آمریکا', symbol: '$' },
    'یورو': { id: '137205', name: 'یورو', symbol: '€' },
    'پوند انگلیس': { id: '137207', name: 'پوند انگلیس', symbol: '£' },
    'لیر ترکیه': { id: '137225', name: 'لیر ترکیه', symbol: '₺' },
    'دینار عراق': { id: '137217', name: 'دینار عراق', symbol: 'IQD' }
};

const goldPrices = { "طلای 18 عیار / 740": null, "طلای 18 عیار": null, "طلای 24 عیار": null, "طلای دست دوم": null, "مثقال طلا": null };
// Initialize currency prices
Object.keys(CURRENCY_INFO).forEach(name => goldPrices[name] = null);
let prevGoldPrices = { ...goldPrices };


// --- DOM References ---
const body = document.body;
const autoCalcForm = document.getElementById('auto-price-calculator');
const manualCalcForm = document.getElementById('manual-price-calculator');
const autoCalcButton = document.getElementById('calculate-auto-btn');
const manualCalcButton = document.getElementById('calculate-manual-btn');
const historyContainer = document.getElementById('history-container');
const historySearchInput = document.getElementById('history-search-input');
const historyFilterSelect = document.getElementById('history-filter');
const historySortSelect = document.getElementById('history-sort');
const priceTable = document.getElementById('goldTable');
const resultDiv = document.getElementById('result');
const themeToggleButton = document.getElementById('theme-toggle-btn');
const sunIcon = document.getElementById('theme-icon-sun');
const moonIcon = document.getElementById('theme-icon-moon');
const totalProfitLossContainer = document.getElementById('total-profit-loss-container');
const toastContainer = document.getElementById('toast-container');
const converterValueInput = document.getElementById('converter-value');
const converterResultDiv = document.getElementById('converter-result');
const modal = document.getElementById('confirmation-modal');
const modalMessage = document.getElementById('modal-message');
let modalConfirmBtn = document.getElementById('modal-confirm-btn');
const modalCancelBtn = document.getElementById('modal-cancel-btn');

// Currency Calculator DOM References
const currencyCard = document.getElementById('currency-card');
const currencyAmountInput = document.getElementById('currency-amount');
const currencyAmountLabel = document.getElementById('currency-amount-label');
const currencyManualPriceGroup = document.getElementById('currency-manual-price-group');
const currencyManualPriceInput = document.getElementById('currency-manual-price');
const currencyLivePriceDisplay = document.getElementById('currency-live-price-display');
const livePriceValueSpan = document.getElementById('live-price-value');
const calculateCurrencyBtn = document.getElementById('calculate-currency-btn');
const currencyResultDiv = document.getElementById('currency-result');

// New Navbar Auth UI DOM References
const navToggleCheckbox = document.getElementById('nav-toggle-checkbox');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const logoutBtnMobile = document.getElementById('logout-btn-mobile');
const mobileLogoutItem = document.getElementById('mobile-logout-item');
const userProfileDiv = document.getElementById('user-profile');
const userAvatarContainer = document.getElementById('user-avatar-container');
const userNameSpan = document.getElementById('user-name');
const userPicImg = document.getElementById('user-pic');
const defaultAvatarIcon = document.getElementById('default-avatar-icon');
const userMenuDropdown = document.getElementById('user-menu-dropdown');


// --- INITIALIZATION ---
window.onload = function () {
    applyInitialTheme();
    setupEventListeners();
    setupParticleAnimation();
    displaySkeletonLoader();
    initAuthListener();
    fetchPricesFromTgju();
    switchCalculatorMode('auto');
    validateForm(autoCalcForm, autoCalcButton, false);
    handleConversion();
    setupCurrencyCalculator();
};

function setupEventListeners() {
    themeToggleButton.addEventListener('click', toggleTheme);
    loginBtn.addEventListener('click', () => {
        closeMobileMenu();
        signInWithGoogle();
    });
    logoutBtn.addEventListener('click', signOutUser);
    logoutBtnMobile.addEventListener('click', () => {
        closeMobileMenu();
        signOutUser();
    });

    userAvatarContainer.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleUserMenu();
    });

    document.addEventListener('click', (e) => {
        if (!userAvatarContainer.contains(e.target)) {
            closeUserMenu();
        }
    });

    document.getElementById('radio-1').addEventListener('change', () => switchCalculatorMode('auto'));
    document.getElementById('radio-2').addEventListener('change', () => switchCalculatorMode('manual'));
    document.getElementById('radio-3').addEventListener('change', () => switchCalculatorMode('converter'));
    autoCalcButton.addEventListener('click', () => calculateAuto(true));
    manualCalcButton.addEventListener('click', () => calculateManual(true));
    document.querySelectorAll('input[name="gold-type-auto-tabs"], input[name="gold-type-manual-tabs"]').forEach(radio => {
        radio.addEventListener('change', () => updateFormVisibility(radio.closest('div[role="tabpanel"]').id.includes('auto') ? 'auto' : 'manual'));
    });
    document.querySelectorAll('.calc-input').forEach(input => {
        if (input.id.startsWith('currency-')) return;

        input.addEventListener('input', (event) => {
            const form = event.target.closest('div[role="tabpanel"]');
            if (!form || form.id.includes('converter')) return;
            if (event.target.id.includes('price-manual')) formatNumberInput(event.target);
            const button = form.querySelector('button[id^="calculate-"]');
            validateForm(form, button, false);
        });
        if (input.classList.contains('calc-input')) {
            input.addEventListener('keypress', (event) => {
                if (event.key === 'Enter') {
                    event.preventDefault();
                    const form = input.closest('div[role="tabpanel"]');
                    if (form.id.includes('converter')) return;
                    const button = form.querySelector('button[id^="calculate-"]');
                    if (button && !button.disabled) button.click();
                }
            });
        }
    });
    document.querySelectorAll('input[name="carat-auto-tabs"], input[name="carat-manual-tabs"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const form = radio.closest('div[role="tabpanel"]');
            const button = form.querySelector('button[id^="calculate-"]');
            validateForm(form, button, false);
        });
    });
    historySearchInput.addEventListener('input', () => loadHistory());
    historyFilterSelect.addEventListener('change', () => loadHistory());
    historySortSelect.addEventListener('change', () => loadHistory());
    converterValueInput.addEventListener('input', handleConversion);
    document.querySelectorAll('input[name="from-unit-tabs"], input[name="to-unit-tabs"]').forEach(radio => {
        radio.addEventListener('change', handleConversion);
    });
    modalCancelBtn.addEventListener('click', hideConfirmationModal);
    modal.addEventListener('click', (e) => { if (e.target === modal) hideConfirmationModal() });
}

// --- NAVBAR & AUTH FUNCTIONS ---
function initAuthListener() {
    body.classList.add('auth-loading');
    let isInitialLoad = true;

    auth.onAuthStateChanged(async (user) => {
        const wasPreviouslyLoggedIn = !!currentUser;
        const isNowLoggedIn = !!user;
        if (isNowLoggedIn) {
            currentUser = { uid: user.uid, displayName: user.displayName, photoURL: user.photoURL };
        } else {
            currentUser = null;
        }
        updateUserUI(user);
        if (!isInitialLoad) {
            if (isNowLoggedIn && !wasPreviouslyLoggedIn) {
                showToast(`خوش آمدید، ${user.displayName}!`, 'success');
                await syncGuestHistoryToFirestore();
            } else if (!isNowLoggedIn && wasPreviouslyLoggedIn) {
                showToast('با موفقیت خارج شدید.');
            }
        }
        await loadHistory();
        if (isInitialLoad) {
            isInitialLoad = false;
            body.classList.remove('auth-loading');
        }
    });
}

function updateUserUI(user) {
    if (user) {
        userNameSpan.textContent = user.displayName;
        userPicImg.onerror = () => {
            userPicImg.classList.add('hidden');
            defaultAvatarIcon.classList.remove('hidden');
        };
        userPicImg.src = user.photoURL || '';
        if (user.photoURL) {
            userPicImg.classList.remove('hidden');
            defaultAvatarIcon.classList.add('hidden');
        } else {
            userPicImg.classList.add('hidden');
            defaultAvatarIcon.classList.remove('hidden');
        }
        userProfileDiv.classList.remove('hidden');
        loginBtn.classList.add('hidden');
        mobileLogoutItem.classList.remove('hidden');
    } else {
        userProfileDiv.classList.add('hidden');
        loginBtn.classList.remove('hidden');
        mobileLogoutItem.classList.add('hidden');
        closeUserMenu();
    }
}

function closeMobileMenu() {
    if (navToggleCheckbox.checked) {
        navToggleCheckbox.checked = false;
    }
}

function toggleUserMenu() {
    const isOpen = userMenuDropdown.classList.toggle('is-open');
    userAvatarContainer.setAttribute('aria-expanded', isOpen);
}

function closeUserMenu() {
    if (userMenuDropdown.classList.contains('is-open')) {
        userMenuDropdown.classList.remove('is-open');
        userAvatarContainer.setAttribute('aria-expanded', 'false');
    }
}

function signInWithGoogle() {
    auth.signInWithPopup(googleProvider).catch(error => {
        console.error("Authentication Error: ", error);
        if (error.code !== 'auth/popup-closed-by-user') {
            showToast('خطا در ورود. لطفاً دوباره تلاش کنید.', 'error');
        }
    });
}

function signOutUser() {
    auth.signOut().catch(error => console.error("Sign Out Error: ", error));
}


async function syncGuestHistoryToFirestore() {
    const guestHistory = JSON.parse(localStorage.getItem(HISTORY_KEY_GUEST));
    if (!guestHistory || guestHistory.length === 0 || !currentUser) return;
    showToast('در حال همگام‌سازی محاسبات محلی شما...', 'warning');
    const batch = db.batch();
    const userItemsRef = db.collection('calculations').doc(currentUser.uid).collection('items');
    guestHistory.forEach(item => batch.set(userItemsRef.doc(), item));
    try {
        await batch.commit();
        localStorage.removeItem(HISTORY_KEY_GUEST);
        showToast('محاسبات شما با موفقیت همگام‌سازی شد!', 'success');
    } catch (error) {
        console.error("Error syncing guest history:", error);
        showToast('خطا در همگام‌سازی تاریخچه.', 'error');
    }
}

// --- HISTORY & P/L MANAGEMENT ---
async function saveCalculation(data) {
    const fullData = { ...data, date: new Date().toISOString() };
    if (currentUser) {
        try {
            await db.collection('calculations').doc(currentUser.uid).collection('items').add(fullData);
            showToast('محاسبه در حساب شما ذخیره شد.');
        } catch (error) { console.error("Error saving to Firestore: ", error); showToast('خطا در ذخیره‌سازی آنلاین.', 'error'); }
    } else {
        let h = JSON.parse(localStorage.getItem(HISTORY_KEY_GUEST)) || [];
        h.unshift(fullData);
        localStorage.setItem(HISTORY_KEY_GUEST, JSON.stringify(h.slice(0, MAX_HISTORY_ITEMS)));
        showToast('محاسبه به صورت محلی ذخیره شد (برای ذخیره دائمی وارد شوید).', 'warning');
    }
    await loadHistory();
    const latestItem = historyContainer.querySelector('.history-item');
    if (latestItem) {
        setTimeout(() => {
            if (!latestItem.classList.contains('is-open')) {
                latestItem.classList.add('is-open');
                latestItem.querySelector('.history-item-summary').setAttribute('aria-expanded', 'true');
            }
        }, 100);
    }
}

async function loadHistory() {
    const searchTerm = historySearchInput.value.toLowerCase();
    const filter = historyFilterSelect.value;
    const sort = historySortSelect.value;
    let history = [];
    if (currentUser) {
        try {
            const snapshot = await db.collection('calculations').doc(currentUser.uid).collection('items').orderBy('date', 'desc').limit(50).get();
            snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
        } catch (error) {
            console.error("Error fetching history from Firestore: ", error);
            historyContainer.innerHTML = `<div class="history-empty-state"><p>خطا در بارگذاری تاریخچه آنلاین.</p></div>`;
            return;
        }
    } else {
        history = (JSON.parse(localStorage.getItem(HISTORY_KEY_GUEST)) || []).map(item => ({ id: item.date, ...item }));
    }

    let filteredHistory = history;
    if (filter !== 'all') {
        filteredHistory = history.filter(item => {
            const type = item.goldType || 'نو/زینتی';
            return type === filter;
        });
    }
    if (searchTerm.trim()) {
        filteredHistory = filteredHistory.filter(item => {
            const searchString = item.goldType === 'ارز'
                ? `${item.currencyName} ${item.amount}`
                : `${item.goldType} ${item.weight} ${item.carat}`;
            return searchString.toLowerCase().includes(searchTerm);
        });
    }

    const currentPrice18 = goldPrices["طلای 18 عیار"]?.price;
    filteredHistory.sort((a, b) => {
        if (sort === 'date-asc') return new Date(a.date) - new Date(b.date);
        if (sort === 'profit-desc' || sort === 'loss-desc') {
            let profitA = 0;
            let profitB = 0;

            if (a.goldType === 'ارز') {
                const currentPriceData = goldPrices[a.currencyName];
                if (currentPriceData && currentPriceData.price) {
                    profitA = (currentPriceData.price - a.basePriceUsed) * a.amount;
                }
            } else {
                if (currentPrice18) {
                    profitA = (a.weight * (currentPrice18 / 750) * a.carat) - a.finalValue;
                }
            }

            if (b.goldType === 'ارز') {
                const currentPriceData = goldPrices[b.currencyName];
                if (currentPriceData && currentPriceData.price) {
                    profitB = (currentPriceData.price - b.basePriceUsed) * b.amount;
                }
            } else {
                if (currentPrice18) {
                    profitB = (b.weight * (currentPrice18 / 750) * b.carat) - b.finalValue;
                }
            }

            return sort === 'profit-desc' ? profitB - profitA : profitA - profitB;
        }
        return new Date(b.date) - new Date(a.date);
    });
    if (filteredHistory.length === 0) {
        historyContainer.innerHTML = `<div class="history-empty-state"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 7h9a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2"/><path d="M5 3a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z"/><path d="M12 12h.01"/></svg><h3>تاریخچه خالی است</h3><p>${(searchTerm || filter !== 'all') ? 'موردی با این مشخصات یافت نشد.' : 'پس از انجام محاسبه، نتایج در اینجا نمایش داده می‌شود.'}</p></div>`;
    } else {
        historyContainer.innerHTML = '';
        filteredHistory.forEach((item, index) => {
            const itemArticle = item.goldType === 'ارز' ? renderCurrencyHistoryItem(item) : renderHistoryItem(item);
            itemArticle.style.animationDelay = `${index * 80}ms`;
            historyContainer.appendChild(itemArticle);
        });
    }
    calculateAndDisplayTotalProfitLoss(history);
}

function renderHistoryItem(item) {
    if (!item || !item.date) return document.createElement('div');
    const visuals = goldTypeVisuals[item.goldType] || goldTypeVisuals['نو/زینتی'];
    const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.date));
    const finalValue = item.finalValue || item.originalValue;

    let profitLoss = null, plClass = 'neutral', plLabel = 'سود/زیان', plIcon = '', currentValue = null, currentValueStr = 'نامشخص';
    const currentPrice18 = goldPrices["طلای 18 عیار"]?.price;
    if (currentPrice18 && finalValue > 0) {
        currentValue = (item.weight * (currentPrice18 / 750) * item.carat);
        currentValueStr = formatterPrice(currentValue.toFixed(0)) + " تومان";
        profitLoss = currentValue - finalValue;
        if (profitLoss > 1) { plClass = 'profit'; plLabel = 'سود'; plIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>`; }
        else if (profitLoss < -1) { plClass = 'loss'; plLabel = 'زیان'; plIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`; }
        else { plClass = 'neutral'; plLabel = '---'; }
    }

    let calcBreakdownHTML = '';
    if (typeof item.baseValue !== 'undefined') {
        calcBreakdownHTML = `<table class="history-item-breakdown">
            <caption>جزئیات محاسبه خرید</caption>
            <tbody>
                <tr><td>ارزش خام:</td><td>${formatterPrice(item.baseValue.toFixed(0))} تومان</td></tr>`;
        if (item.goldType === 'نو/زینتی') { calcBreakdownHTML += `<tr><td>+ اجرت (${item.commission || 0}٪):</td><td>${formatterPrice(item.wageAmount.toFixed(0))} تومان</td></tr>`; }
        if (item.goldType !== 'آب‌شده') {
            calcBreakdownHTML += `<tr><td>+ سود (${item.profit || 0}٪):</td><td>${formatterPrice(item.profitAmount.toFixed(0))} تومان</td></tr>
                                  <tr><td>+ مالیات (${item.tax || 0}٪):</td><td>${formatterPrice(item.taxAmount.toFixed(0))} تومان</td></tr>`;
        }
        calcBreakdownHTML += `<tr class="final-row" style="border-top: 1px solid var(--border-color);"><td>ارزش کل خرید:</td><td>${formatterPrice(finalValue.toFixed(0))} تومان</td></tr></tbody></table>`;
    }

    const plBreakdownHTML = `<table class="history-item-breakdown" style="margin-top: 1rem;">
        <caption>تحلیل سود و زیان</caption>
        <tbody>
            <tr><td>ارزش فعلی:</td><td>${currentValueStr}</td></tr>
            <tr><td>سود/زیان:</td><td class="pl-value ${plClass}">${profitLoss !== null ? formatterPrice(profitLoss.toFixed(0)) + ' تومان' : '-'}</td></tr>
        </tbody></table>`;

    const priceContextHTML = item.basePriceUsed ? `<div class="history-item-price-context">قیمت مبنا (هر گرم ۱۸ عیار): <b>${formatterPrice(item.basePriceUsed)} تومان</b></div>` : '';
    const detailsHTML = `${calcBreakdownHTML}${plBreakdownHTML}${priceContextHTML}`;

    const itemArticle = document.createElement('article');
    itemArticle.className = 'history-item';
    itemArticle.setAttribute('data-id', item.id);
    itemArticle.innerHTML = `
        <div class="history-item-summary" role="button" aria-expanded="false">
            <div class="history-item-main">
                <div class="history-item-icon ${visuals.tagClass}">${visuals.icon}</div>
                <div class="history-item-info">
                    <span class="spec">${item.weight} گرم <span class="gold-tag ${visuals.tagClass}">${visuals.label}</span></span>
                    <span class="date">${date}</span>
                </div>
            </div>
            <div class="history-item-pl ${plClass}">
                <span class="pl-label">${plLabel}</span>
                <span class="pl-value">${plIcon} ${profitLoss !== null ? formatterPrice(Math.abs(profitLoss).toFixed(0)) : '-'}</span>
            </div>
        </div>
        <div class="history-item-details">
            ${detailsHTML}
            <div class="history-item-footer">
                <button class="modal-button secondary reuse-btn" aria-label="استفاده مجدد"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg> استفاده مجدد</button>
                <button class="modal-button danger delete-btn" aria-label="حذف محاسبه"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> حذف</button>
            </div>
        </div>`;
    const summary = itemArticle.querySelector('.history-item-summary');
    summary.addEventListener('click', () => { itemArticle.classList.toggle('is-open'); summary.setAttribute('aria-expanded', itemArticle.classList.contains('is-open')); });
    itemArticle.querySelector('.reuse-btn').addEventListener('click', (e) => { e.stopPropagation(); reuseCalculation(item); });
    itemArticle.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmationModal('آیا از حذف این محاسبه مطمئن هستید؟', () => deleteHistoryItem(item.id, itemArticle));
    });
    return itemArticle;
}

function renderCurrencyHistoryItem(item) {
    if (!item || !item.date) return document.createElement('div');

    const currency = CURRENCY_INFO[item.currencyName] || { symbol: '?', name: item.currencyName };
    const date = new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(item.date));
    const finalValue = item.finalValue;

    let profitLoss = null, plClass = 'neutral', plLabel = 'سود/زیان', plIcon = '', currentValue = null, currentValueStr = 'نامشخص';
    const currentPriceData = goldPrices[item.currencyName];
    if (currentPriceData && currentPriceData.price && item.basePriceUsed > 0) {
        currentValue = currentPriceData.price * item.amount;
        currentValueStr = formatterPrice(currentValue.toFixed(0)) + " تومان";
        profitLoss = currentValue - finalValue;
        if (profitLoss > 1) { plClass = 'profit'; plLabel = 'سود'; plIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 14l5-5 5 5z"/></svg>`; }
        else if (profitLoss < -1) { plClass = 'loss'; plLabel = 'زیان'; plIcon = `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M7 10l5 5 5-5z"/></svg>`; }
        else { plClass = 'neutral'; plLabel = '---'; }
    }

    const plSummaryHTML = `<div class="history-item-pl ${plClass}"><span class="pl-label">${plLabel}</span><span class="pl-value">${plIcon} ${profitLoss !== null ? formatterPrice(Math.abs(profitLoss).toFixed(0)) : '-'}</span></div>`;

    const breakdownHTML = `<table class="history-item-breakdown">
                           <caption>تحلیل سود و زیان</caption>
                           <tbody>
                           <tr><td>ارزش خرید:</td><td>${formatterPrice(finalValue.toFixed(0))} تومان</td></tr>
                           <tr><td>ارزش فعلی:</td><td>${currentValueStr}</td></tr>
                           <tr class="final-row" style="border-top: 1px solid var(--border-color);"><td>سود/زیان:</td><td class="pl-value ${plClass}">${profitLoss !== null ? formatterPrice(profitLoss.toFixed(0)) + ' تومان' : '-'}</td></tr>
                           </tbody></table>`;
    const priceContextHTML = `<div class="history-item-price-context">قیمت هر واحد در زمان خرید: <b>${formatterPrice(item.basePriceUsed)} تومان</b></div>`;
    const detailsHTML = `${breakdownHTML}${priceContextHTML}`;

    const itemArticle = document.createElement('article');
    itemArticle.className = 'history-item';
    itemArticle.setAttribute('data-id', item.id);
    itemArticle.innerHTML = `
        <div class="history-item-summary" role="button" aria-expanded="false">
            <div class="history-item-main">
                <div class="history-item-icon tag-currency">${currency.symbol}</div>
                <div class="history-item-info">
                    <span class="spec">${formatterPrice(item.amount)} <span class="gold-tag tag-currency">${currency.name}</span></span>
                    <span class="date">${date}</span>
                </div>
            </div>
            ${plSummaryHTML}
        </div>
        <div class="history-item-details">
            ${detailsHTML}
            <div class="history-item-footer">
                <button class="modal-button secondary reuse-btn" aria-label="استفاده مجدد"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M21 21v-5h-5"/></svg> استفاده مجدد</button>
                <button class="modal-button danger delete-btn" aria-label="حذف محاسبه">
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg> حذف
                </button>
            </div>
        </div>`;

    const summary = itemArticle.querySelector('.history-item-summary');
    summary.addEventListener('click', () => {
        itemArticle.classList.toggle('is-open');
        summary.setAttribute('aria-expanded', itemArticle.classList.contains('is-open'));
    });

    itemArticle.querySelector('.reuse-btn').addEventListener('click', (e) => { e.stopPropagation(); reuseCalculation(item); });
    itemArticle.querySelector('.delete-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        showConfirmationModal('آیا از حذف این محاسبه مطمئن هستید؟', () => deleteHistoryItem(item.id, itemArticle));
    });

    return itemArticle;
}

async function deleteHistoryItem(id, itemElement) {
    if (!id) return;
    itemElement.classList.add('is-deleting');
    try {
        if (currentUser) {
            await db.collection('calculations').doc(currentUser.uid).collection('items').doc(id).delete();
        } else {
            let h = JSON.parse(localStorage.getItem(HISTORY_KEY_GUEST)) || [];
            localStorage.setItem(HISTORY_KEY_GUEST, JSON.stringify(h.filter(item => item.date !== id)));
        }
        itemElement.classList.remove('is-deleting');
        itemElement.classList.add('is-deleted');
        showToast('محاسبه حذف شد.');
        setTimeout(async () => {
            itemElement.remove();
            const remainingItems = await getHistoryData();
            calculateAndDisplayTotalProfitLoss(remainingItems);
            if (remainingItems.length === 0) {
                loadHistory();
            }
        }, 300);
    } catch (error) {
        console.error("Error deleting item: ", error);
        showToast('خطا در حذف محاسبه.', 'error');
        itemElement.classList.remove('is-deleting');
    }
}

async function getHistoryData() {
    let history = [];
    if (currentUser) {
        const snapshot = await db.collection('calculations').doc(currentUser.uid).collection('items').get();
        snapshot.forEach(doc => history.push({ id: doc.id, ...doc.data() }));
    } else {
        history = (JSON.parse(localStorage.getItem(HISTORY_KEY_GUEST)) || []).map(item => ({ id: item.date, ...item }));
    }
    return history;
}

function calculateAndDisplayTotalProfitLoss(history) {
    const currentPrice18 = goldPrices["طلای 18 عیار"]?.price;

    if (!history || history.length === 0) {
        totalProfitLossContainer.innerHTML = '<p>موردی برای محاسبه وجود ندارد.</p>';
        return;
    }
    const hasAnyPrice = currentPrice18 || Object.keys(CURRENCY_INFO).some(name => goldPrices[name] && goldPrices[name].price);
    if (!hasAnyPrice) {
        totalProfitLossContainer.innerHTML = '<p>قیمت لحظه‌ای برای محاسبه سود/زیان در دسترس نیست.</p>';
        return;
    }
    const totalProfitLoss = history.reduce((acc, item) => {
        if (!item) return acc;
        let itemProfit = 0;
        if (item.goldType === 'ارز') {
            const currentPriceData = goldPrices[item.currencyName];
            if (currentPriceData && currentPriceData.price && typeof item.basePriceUsed !== 'undefined' && typeof item.amount !== 'undefined') {
                itemProfit = (currentPriceData.price - item.basePriceUsed) * item.amount;
            }
        } else {
            if (currentPrice18 && typeof item.weight !== 'undefined' && typeof item.carat !== 'undefined' && typeof item.finalValue !== 'undefined') {
                itemProfit = (item.weight * (currentPrice18 / 750) * item.carat) - item.finalValue;
            }
        }
        return acc + itemProfit;
    }, 0);
    let cssClass = 'neutral';
    if (totalProfitLoss > 1) cssClass = 'profit';
    else if (totalProfitLoss < -1) cssClass = 'loss';
    totalProfitLossContainer.innerHTML = `<div class="total-profit-loss-display"><span class="label">سود / زیان کلی</span><span class="profit-loss-value ${cssClass}">${formatterPrice(Math.abs(totalProfitLoss).toFixed(0))} تومان</span></div>`;
}

// --- UTILITY, UI, and PRICE FETCHING FUNCTIONS ---
const goldTypeVisuals = {
    'نو/زینتی': { label: 'طلای نو', tagClass: 'tag-new', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.94c1.5 0 2.75 1.06 4 0s2.5-1.06 4 0c1.5 0 2.75 1.06 4 0s2.5-1.06 4 0V4.06c-1.5 0-2.75-1.06-4 0s-2.5 1.06-4 0c-1.5 0-2.75-1.06-4 0s-2.5 1.06-4 0z"/><path d="M4 4.06V20.94"/><path d="M20 20.94V4.06"/></svg>` },
    'دست دوم': { label: 'دست دوم', tagClass: 'tag-used', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 18c.6 0 1-.4 1-1v-1a2 2 0 0 0-2-2h-2"/><path d="M4 18c-.6 0-1-.4-1-1v-1a2 2 0 0 1 2-2h2"/><path d="M10 14h4"/><path d="M18 10V8a2 2 0 0 0-2-2h-2"/><path d="M6 10V8a2 2 0 0 1 2-2h2"/><path d="m12 14 2 2 2-2"/><path d="m12 10-2-2-2 2"/></svg>` },
    'آب‌شده': { label: 'آب‌شده', tagClass: 'tag-melted', icon: `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9.5c-2-2.8-4-5-4-5.5 0-2 2-3.5 4-3.5s4 1.5 4 3.5c0 .5-2 2.7-4 5.5z"/><path d="M12 20.5c-5.5-5.5-5.5-12 0-17 5.5 5 5.5 11.5 0 17z"/></svg>` }
};

function reuseCalculation(item) {
    if (item.goldType === 'ارز') {
        document.getElementById('currency-card').scrollIntoView({ behavior: 'smooth' });

        const currencyRadio = document.querySelector(`input[name="currency-tabs"][value="${item.currencyName}"]`);
        if (currencyRadio) currencyRadio.checked = true;

        document.getElementById('price-mode-manual').checked = true;

        updateCurrencyUI();

        document.getElementById('currency-amount').value = item.amount;
        const manualPriceInput = document.getElementById('currency-manual-price');
        manualPriceInput.value = item.basePriceUsed;
        formatNumberInput(manualPriceInput);

        validateCurrencyForm(false);
    } else {
        document.getElementById('radio-1').checked = true;
        switchCalculatorMode('auto');
        const typeToSelect = item.goldType || 'نو/زینتی';
        const radioToSelect = document.querySelector(`input[name="gold-type-auto-tabs"][value="${typeToSelect}"]`);
        if (radioToSelect) radioToSelect.checked = true;
        updateFormVisibility('auto');
        document.getElementById('weight-auto').value = item.weight || '';
        if (item.goldType === 'آب‌شده') {
            document.getElementById('carat-auto').value = item.carat || '';
        } else {
            const caratRadio = document.getElementById(`carat-auto-${item.carat}`);
            if (caratRadio) caratRadio.checked = true;
        }
        document.getElementById('commission-auto').value = item.commission || '';
        document.getElementById('profit-auto').value = item.profit || '';
        document.getElementById('tax-auto').value = item.tax || '';
        validateForm(autoCalcForm, autoCalcButton, false);
        document.getElementById('calculator-card').scrollIntoView({ behavior: 'smooth' });
    }
}

function showConfirmationModal(message, onConfirm) {
    modalMessage.textContent = message;
    modal.classList.remove('hidden');
    const newConfirmBtn = modalConfirmBtn.cloneNode(true);
    modalConfirmBtn.parentNode.replaceChild(newConfirmBtn, modalConfirmBtn);
    modalConfirmBtn = newConfirmBtn;
    modalConfirmBtn.addEventListener('click', () => {
        onConfirm();
        hideConfirmationModal();
    }, { once: true });
}

function hideConfirmationModal() {
    modal.classList.add('hidden');
}

function switchCalculatorMode(mode) {
    const modes = ['auto', 'manual', 'converter'];
    modes.forEach(m => {
        const panel = document.getElementById(`${m}-price-calculator`) || document.getElementById('unit-converter');
        if (panel) panel.classList.toggle('hidden', m !== mode);
    });
    resultDiv.classList.toggle('hidden', mode === 'converter');
    if (mode === 'auto') { updateFormVisibility('auto'); validateForm(autoCalcForm, autoCalcButton, false); }
    if (mode === 'manual') { updateFormVisibility('manual'); validateForm(manualCalcForm, manualCalcButton, false); }
    if (mode === 'converter') handleConversion();
}

function updateFormVisibility(mode) {
    const goldType = document.querySelector(`input[name="gold-type-${mode}-tabs"]:checked`).value;
    document.getElementById(`commission-group-${mode}`).classList.toggle('hidden', goldType !== 'نو/زینتی');
    document.getElementById(`profit-group-${mode}`).classList.toggle('hidden', goldType === 'آب‌شده');
    document.getElementById(`tax-group-${mode}`).classList.toggle('hidden', goldType === 'آب‌شده');
    document.getElementById(`carat-select-group-${mode}`).classList.toggle('hidden', goldType === 'آب‌شده');
    document.getElementById(`carat-input-group-${mode}`).classList.toggle('hidden', goldType !== 'آب‌شده');
}

function applyInitialTheme() {
    const theme = localStorage.getItem("theme") || "light";
    document.body.classList.toggle("dark-mode", theme === "dark");
    updateThemeIcons(theme);
}

function toggleTheme() {
    const isDarkMode = document.body.classList.toggle("dark-mode");
    const newTheme = isDarkMode ? "dark" : "light";
    localStorage.setItem("theme", newTheme);
    updateThemeIcons(newTheme);
}

function updateThemeIcons(theme) {
    if (sunIcon && moonIcon) {
        sunIcon.classList.toggle("hidden", theme === "dark");
        moonIcon.classList.toggle("hidden", theme === "light");
    }
}

function setupParticleAnimation() {
    const canvas = document.getElementById("particle-canvas");
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    let particlesArray;
    function setCanvasSize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    class Particle {
        constructor() {
            this.x = Math.random() * canvas.width;
            this.y = Math.random() * canvas.height;
            this.size = Math.random() * 2.5 + 1;
            this.speedX = Math.random() * 0.8 - 0.4;
            this.speedY = Math.random() * 0.8 - 0.4;
        }
        update() {
            this.x += this.speedX;
            this.y += this.speedY;
            if (this.x > canvas.width + 5) this.x = -5;
            if (this.x < -5) this.x = canvas.width + 5;
            if (this.y > canvas.height + 5) this.y = -5;
            if (this.y < -5) this.y = canvas.height + 5;
        }
        draw() {
            ctx.beginPath();
            const gradient = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.size);
            gradient.addColorStop(0, "rgba(212, 175, 55, 0.8)");
            gradient.addColorStop(1, "rgba(212, 175, 55, 0)");
            ctx.fillStyle = gradient;
            ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }
    function initParticles() {
        setCanvasSize();
        particlesArray = [];
        const numberOfParticles = (canvas.height * canvas.width) / 9000;
        for (let i = 0; i < numberOfParticles; i++) {
            particlesArray.push(new Particle());
        }
    }
    function animateParticles() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        for (let i = 0; i < particlesArray.length; i++) {
            particlesArray[i].update();
            particlesArray[i].draw();
        }
        requestAnimationFrame(animateParticles);
    }
    initParticles();
    animateParticles();
    window.addEventListener("resize", () => {
        clearTimeout(window.resizedFinished);
        window.resizedFinished = setTimeout(initParticles, 150);
    });
}

function validateSingleInput(input, showRequiredError = false) {
    const value = cleanNumber(input.value);
    const errorElement = document.getElementById(input.id + '-error');
    let errorMessage = '';
    const isOptional = input.closest('.form-group.hidden') || ['commission', 'profit', 'tax'].some(id => input.id.includes(id));
    let isInputValid = true;
    if (value.trim() === '' && !isOptional) {
        if (showRequiredError) errorMessage = 'این فیلد الزامی است.';
        isInputValid = false;
    } else if (value.trim() !== '' && !/^\d*\.?\d*$/.test(value)) {
        errorMessage = 'لطفا فقط از اعداد و یک نقطه استفاده کنید.';
        isInputValid = false;
    } else if (value.trim() !== '') {
        const numValue = parseFloat(value);
        if (numValue < 0) {
            errorMessage = 'مقدار نمی‌تواند منفی باشد.';
            isInputValid = false;
        } else if (numValue === 0 && !isOptional) {
            errorMessage = 'مقدار باید بزرگتر از صفر باشد.';
            isInputValid = false;
        } else if (input.id.includes('carat-auto') || input.id.includes('carat-manual')) {
            if (numValue > 1000 || numValue < 1) {
                errorMessage = 'عیار باید بین ۱ تا ۱۰۰۰ باشد.';
                isInputValid = false;
            }
        } else if (input.id.includes('weight') && numValue > 10000) {
            errorMessage = 'وزن بیش از حد زیاد است.';
            isInputValid = false;
        }
    }
    input.classList.toggle('input-error', !!errorMessage);
    if (errorElement) errorElement.textContent = errorMessage;
    return isInputValid;
}

function validateForm(form, button, showRequiredError = false) {
    const inputs = form.querySelectorAll('.calc-input');
    let isFormValid = true;
    inputs.forEach(input => {
        if (!input.closest('.form-group.hidden')) {
            if (!validateSingleInput(input, showRequiredError)) {
                isFormValid = false;
            }
        }
    });
    if (button) button.disabled = !isFormValid;
    return isFormValid;
}

function getFormValues(mode) {
    const goldType = document.querySelector(`input[name="gold-type-${mode}-tabs"]:checked`).value;
    let carat = 0;
    if (goldType === 'آب‌شده') {
        carat = parseFloat(cleanNumber(document.getElementById(`carat-${mode}`).value)) || 0;
    } else {
        const checkedRadio = document.querySelector(`input[name="carat-${mode}-tabs"]:checked`);
        carat = checkedRadio ? parseFloat(checkedRadio.value) : 0;
    }
    return {
        goldType: goldType,
        weight: parseFloat(cleanNumber(document.getElementById(`weight-${mode}`).value)) || 0,
        carat: carat,
        commission: parseFloat(cleanNumber(document.getElementById(`commission-${mode}`).value)) || 0,
        profit: parseFloat(cleanNumber(document.getElementById(`profit-${mode}`).value)) || 0,
        tax: parseFloat(cleanNumber(document.getElementById(`tax-${mode}`).value)) || 0,
    };
}

function calculate(values, price18, isAuto) {
    let basePriceSource = price18;
    let calcPriceDisplay = price18;
    if (isAuto && values.goldType === 'دست دوم' && goldPrices["طلای دست دوم"]?.price) {
        basePriceSource = goldPrices["طلای دست دوم"].price;
        calcPriceDisplay = basePriceSource;
    }
    if (!basePriceSource) {
        resultDiv.innerHTML = '<p class="error">قیمت لحظه‌ای در دسترس نیست.</p>';
        return;
    }
    if (!isValidInput(values.weight, values.carat)) {
        resultDiv.innerHTML = '<p class="error">لطفا وزن و عیار معتبر وارد کنید.</p>';
        return;
    }
    const pricePerGramOfCarat = (basePriceSource / 750) * values.carat;
    const baseValue = values.weight * pricePerGramOfCarat;
    let wageAmount = 0, profitAmount = 0, taxAmount = 0, finalValue = baseValue;
    if (values.goldType === 'نو/زینتی') {
        wageAmount = baseValue * (values.commission / 100);
        const subtotal_after_wage = baseValue + wageAmount;
        profitAmount = subtotal_after_wage * (values.profit / 100);
        taxAmount = (wageAmount + profitAmount) * (values.tax / 100);
        finalValue = baseValue + wageAmount + profitAmount + taxAmount;
    } else if (values.goldType === 'دست دوم') {
        profitAmount = baseValue * (values.profit / 100);
        taxAmount = profitAmount * (values.tax / 100);
        finalValue = baseValue + profitAmount + taxAmount;
    }
    const calcType = (isAuto && values.goldType === 'دست دوم') ? `با قیمت لحظه‌ای (هر گرم دست دوم: ${formatterPrice(calcPriceDisplay)} تومان)` : `با قیمت ${isAuto ? 'لحظه‌ای' : 'دستی'} (هر گرم ۱۸ عیار: ${formatterPrice(calcPriceDisplay)} تومان)`;
    const resultData = { ...values, baseValue, wageAmount, profitAmount, taxAmount, finalValue, calcType, basePriceUsed: calcPriceDisplay };
    resultDiv.innerHTML = createResultTable(resultData);
    setupShareButton(resultData);
    saveCalculation(resultData);
}

function calculateAuto(showErrors = false) { if (validateForm(autoCalcForm, autoCalcButton, showErrors)) calculate(getFormValues('auto'), goldPrices["طلای 18 عیار"]?.price, true); }
function calculateManual(showErrors = false) { if (validateForm(manualCalcForm, manualCalcButton, showErrors)) calculate(getFormValues('manual'), parseFloat(cleanNumber(document.getElementById('price-manual').value)), false); }

function createResultTable(data) {
    let tableHTML = `<p style="font-size: 0.875rem; color: var(--text-light-color); text-align:center;">${data.calcType}</p><table style="width: 100%;" class="result-table"><tbody><tr><td>ارزش خام طلا</td><td>${formatterPrice(data.baseValue.toFixed(0))} تومان</td></tr>`;
    if (data.goldType === 'نو/زینتی') { tableHTML += `<tr><td>+ اجرت ساخت (${data.commission || 0}٪)</td><td>${formatterPrice(data.wageAmount.toFixed(0))} تومان</td></tr>`; }
    if (data.goldType !== 'آب‌شده') { tableHTML += `<tr><td>+ سود فروشنده (${data.profit || 0}٪)</td><td>${formatterPrice(data.profitAmount.toFixed(0))} تومان</td></tr><tr><td>+ مالیات (${data.tax || 0}٪)</td><td>${formatterPrice(data.taxAmount.toFixed(0))} تومان</td></tr>`; }
    tableHTML += `<tr class="final-row"><td>مبلغ نهایی</td><td><b>${formatterPrice(data.finalValue.toFixed(0))} تومان</b></td></tr></tbody></table><button id="share-result-btn" title="کپی یا اشتراک‌گذاری نتیجه"><svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg> اشتراک‌گذاری</button>`;
    return tableHTML;
}

function setupShareButton(data) {
    const shareBtn = document.getElementById('share-result-btn');
    if (!shareBtn) return;
    let shareText = `محاسبه قیمت طلا (${data.goldType}):\n- وزن: ${data.weight} گرم\n- عیار: ${data.carat}\n- ارزش خام: ${formatterPrice(data.baseValue.toFixed(0))} تومان\n- مبلغ نهایی: ${formatterPrice(data.finalValue.toFixed(0))} تومان`;
    shareBtn.addEventListener('click', async () => {
        if (navigator.share) {
            try { await navigator.share({ title: 'نتیجه محاسبه قیمت طلا', text: shareText }); } catch (e) { }
        } else {
            navigator.clipboard.writeText(shareText).then(() => showToast('نتیجه در کلیپ‌بورد کپی شد')).catch(e => showToast('خطا در کپی کردن', 'error'));
        }
    });
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function displaySkeletonLoader() {
    let skeletonHTML = '<tbody>';
    const rowCount = 10; // To match the number of items in the widget
    for (let i = 0; i < rowCount; i++) {
        skeletonHTML += `<tr><td><div class="skeleton skeleton-text"></div></td><td><div class="price-cell-content"><div class="skeleton skeleton-text"></div><div class="skeleton skeleton-text short"></div></div></td></tr>`;
    }
    skeletonHTML += '</tbody>';
    priceTable.innerHTML = `<thead><tr><th>نوع</th><th>قیمت (تومان)</th></tr></thead>${skeletonHTML}`;
}

const proxyUrl = (targetUrl) => `https://gold-proxy.epfereydoon.workers.dev/?url=${encodeURIComponent(targetUrl)}`;

async function fetchPricesFromTgju() {
    clearTimeout(retryTimeout);
    autoCalcButton.disabled = true;
    calculateCurrencyBtn.disabled = true;
    prevGoldPrices = JSON.parse(JSON.stringify(goldPrices));

    const goldItemIds = ['391292', '137121', '137122', '391295', '137120'];
    const currencyItemIds = Object.values(CURRENCY_INFO).map(c => c.id);
    const allItemIds = [...new Set([...goldItemIds, ...currencyItemIds])].join(',');

    const targetApiUrl = `https://api.tgju.org/v1/widget/tmp?keys=${allItemIds}`;
    const proxiedApiUrl = proxyUrl(targetApiUrl);

    try {
        const response = await fetch(proxiedApiUrl);
        if (!response.ok) throw new Error(`Request failed: ${response.status}`);
        const data = await response.json();
        if (!data || !data.response || !Array.isArray(data.response.indicators)) throw new Error("Invalid API data");

        clearInterval(retryCountdownInterval);
        const priceList = data.response.indicators;
        priceList.forEach(item => {
            const priceData = { price: parseFloat(item.p.replace(/,/g, '')), changeAmount: parseFloat(item.d.replace(/,/g, '')), changePercent: item.dp, direction: item.dt };
            if ([...currencyItemIds, '137120', '391292', '137121', '137122', '391295'].includes(String(item.item_id))) {
                priceData.price /= 10;
                priceData.changeAmount /= 10;
            }

            if (isNaN(priceData.price)) return;

            switch (item.item_id) {
                case 391292: goldPrices["طلای 18 عیار / 740"] = priceData; break;
                case 137121: goldPrices["طلای 18 عیار"] = priceData; break;
                case 137122: goldPrices["طلای 24 عیار"] = priceData; break;
                case 391295: goldPrices["طلای دست دوم"] = priceData; break;
                case 137120: goldPrices["مثقال طلا"] = priceData; break;
            }
            for (const [name, info] of Object.entries(CURRENCY_INFO)) {
                if (String(item.item_id) === info.id) {
                    goldPrices[name] = priceData;
                    break;
                }
            }
        });

        localStorage.setItem(CACHED_PRICES_KEY, JSON.stringify({ prices: goldPrices, timestamp: new Date().toISOString() }));
        displayPrices();
        updateCurrencyUI();
        await loadHistory(); // FIX: Recalculate P/L with new prices
        lastUpdateTime = new Date();
        displayUpdateStatus();
        startPriceUpdateCycle();
        validateForm(autoCalcForm, autoCalcButton, false);
        validateCurrencyForm(false);
    } catch (error) {
        console.error("Critical error fetching data:", error);
        handleFetchError();
    }
}

async function handleFetchError() {
    clearTimeout(retryTimeout);
    clearInterval(priceUpdateInterval);
    clearInterval(countdownInterval);
    clearInterval(retryCountdownInterval);

    const cachedData = JSON.parse(localStorage.getItem(CACHED_PRICES_KEY));
    if (cachedData && cachedData.prices) {
        Object.assign(goldPrices, cachedData.prices);
        lastUpdateTime = new Date(cachedData.timestamp);
        showToast('خطا در دریافت قیمت. از آخرین داده ذخیره‌شده استفاده شد.', 'warning');
        displayPrices();
        updateCurrencyUI();
    } else {
        priceTable.innerHTML = '<tr><td colspan="2" class="error">خطا در دریافت قیمت‌ها.</td></tr>';
        showToast('خطا در دریافت قیمت‌ها', 'error');
    }
    startErrorRetryCountdown();
}

function startErrorRetryCountdown() {
    let secondsRemaining = RETRY_INTERVAL / 1000;
    const initialMessage = `خطا. تلاش مجدد تا <span id="retry-countdown" class="countdown-timer">${secondsRemaining}</span> ثانیه...`;
    displayUpdateStatus(false, initialMessage);
    retryCountdownInterval = setInterval(() => {
        secondsRemaining--;
        const countdownElement = document.getElementById('retry-countdown');
        if (countdownElement) {
            countdownElement.textContent = secondsRemaining;
        }
        if (secondsRemaining <= 0) {
            clearInterval(retryCountdownInterval);
            fetchPricesFromTgju();
        }
    }, 1000);
}

function displayPrices() {
    const tbody = document.createElement("tbody");
    const nameMap = {
        "طلای 18 عیار / 740": "گرم طلای ۱۸ عیار (۷۴۰)",
        "طلای 18 عیار": "گرم طلای ۱۸ عیار (۷۵۰)",
        "طلای 24 عیار": "گرم طلای ۲۴ عیار",
        "طلای دست دوم": "گرم طلای دست دوم",
        "مثقال طلا": "مثقال طلا",
        ...Object.fromEntries(Object.entries(CURRENCY_INFO).map(([key, val]) => [key, val.name]))
    };

    Object.keys(nameMap).forEach(key => {
        if (!goldPrices[key]) return;
        const priceData = goldPrices[key];
        const prevPriceData = prevGoldPrices[key];
        let flashClass = '';
        if (priceData && prevPriceData && priceData.price !== prevPriceData.price) {
            flashClass = priceData.price > prevPriceData.price ? 'flash-up' : 'flash-down';
        }
        const row = tbody.insertRow();
        row.className = flashClass;
        row.insertCell(0).textContent = nameMap[key];
        const priceCell = row.insertCell(1);

        if (priceData) {
            let directionClass = '';
            let arrowHTML = '';
            const changeAmount = priceData.changeAmount || 0;

            // رنگ و پیکان را فقط زمانی اعمال می‌کنیم که تغییر غیرصفر و جهت مشخص باشد
            if (changeAmount !== 0 && priceData.direction) {
                const direction = String(priceData.direction).trim().toLowerCase();

                // FIX: Use 'high' and 'low' from API to determine color class
                if (direction === 'high') {
                    directionClass = 'up'; // 'up' class for green color
                } else if (direction === 'low') {
                    directionClass = 'low'; // 'low' class for red color
                }
            }

            // پیکان جهت‌نما فقط در صورتی نمایش داده می‌شود که رنگ مشخص شده باشد
            if (directionClass) {
                arrowHTML = `<span class="price-change-arrow"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 12 8"><path fill="none" stroke="currentcolor" stroke-linecap="round" stroke-width="2" d="m1 6 5-4 5 4"></path></svg></span>`;
            }

            const changeAmountDisplay = formatterPrice(Math.abs(changeAmount));
            const changeHTML = `<div class="price-change ${directionClass}">${arrowHTML}<span class="change-amount">${changeAmountDisplay}</span><span class="change-percent">(${priceData.changePercent}%)</span></div>`;

            priceCell.innerHTML = `<div class="price-cell-content"><span class="price-value">${formatterPrice(priceData.price)}</span>${changeHTML}</div>`;
        } else {
            priceCell.innerHTML = `<span class="price-value">نامشخص</span>`;
        }
    });
    priceTable.innerHTML = '<thead><tr><th>نوع</th><th>قیمت (تومان)</th></tr></thead>';
    priceTable.appendChild(tbody);
}

function refreshPrices() {
    autoCalcButton.disabled = true;
    calculateCurrencyBtn.disabled = true;
    displaySkeletonLoader();
    const statusContainer = document.getElementById("update-status-container");
    if (statusContainer) statusContainer.innerHTML = "";
    fetchPricesFromTgju();
}

function displayUpdateStatus(isCached = false, customMessage = '') {
    const container = document.getElementById("update-status-container");
    if (!container) return;
    let timeTextHTML = '';
    if (customMessage) {
        timeTextHTML = `<span class="stale-prices">${customMessage}</span>`;
    } else if (lastUpdateTime) {
        const timeFormatted = new Intl.DateTimeFormat("fa-IR", { dateStyle: "medium", timeStyle: "short" }).format(lastUpdateTime);
        timeTextHTML = `آخرین به‌روزرسانی: ${timeFormatted}${isCached ? ' (ذخیره شده)' : ''} <span id="countdown-timer" class="countdown-timer"></span>`;
    }
    container.innerHTML = `<div class="update-status"><button onclick="refreshPrices()" class="refresh-btn" title="دریافت قیمت جدید"><svg class="refresh-icon" xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"></path><path d="M21 3v5h-5"></path><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"></path><path d="M8 16H3v5"></path></svg></button><div class="time-text" id="time-text-container">${timeTextHTML}</div></div>`;
}

function startPriceUpdateCycle() {
    clearInterval(priceUpdateInterval);
    clearInterval(countdownInterval);
    priceUpdateInterval = setInterval(refreshPrices, REFRESH_INTERVAL);
    let countdown = REFRESH_INTERVAL;
    const timerElement = document.getElementById('countdown-timer');
    const updateCountdown = () => {
        if (!timerElement) { clearInterval(countdownInterval); return; }
        countdown -= 1000;
        const minutes = Math.floor(countdown / (1000 * 60));
        const seconds = Math.floor((countdown % (1000 * 60)) / 1000);
        timerElement.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
        if (countdown <= 0) countdown = REFRESH_INTERVAL;
    };
    updateCountdown();
    countdownInterval = setInterval(updateCountdown, 1000);
}

// --- CURRENCY CALCULATOR ---
function setupCurrencyCalculator() {
    document.querySelectorAll('input[name="currency-tabs"], input[name="price-mode-tabs"]').forEach(radio => {
        radio.addEventListener('change', updateCurrencyUI);
    });
    [currencyAmountInput, currencyManualPriceInput].forEach(input => {
        input.addEventListener('input', () => {
            if (input === currencyManualPriceInput) formatNumberInput(input);
            validateCurrencyForm(false);
        });
    });
    calculateCurrencyBtn.addEventListener('click', () => calculateAndSaveCurrency(true));
    updateCurrencyUI();
}

function updateCurrencyUI() {
    const selectedCurrencyName = document.querySelector('input[name="currency-tabs"]:checked').value;
    const priceMode = document.querySelector('input[name="price-mode-tabs"]:checked').value;

    currencyAmountLabel.textContent = `مقدار (${selectedCurrencyName})`;

    const isManual = priceMode === 'manual';
    currencyManualPriceGroup.classList.toggle('hidden', !isManual);
    currencyLivePriceDisplay.classList.toggle('hidden', isManual);

    if (!isManual) {
        const livePriceData = goldPrices[selectedCurrencyName];
        livePriceValueSpan.textContent = livePriceData ? formatterPrice(livePriceData.price) : 'نامشخص';
    }

    validateCurrencyForm(false);
}

function validateCurrencyForm(showRequiredError = true) {
    let isFormValid = true;
    if (!validateSingleInput(currencyAmountInput, showRequiredError)) {
        isFormValid = false;
    }
    const priceMode = document.querySelector('input[name="price-mode-tabs"]:checked').value;
    if (priceMode === 'manual') {
        if (!validateSingleInput(currencyManualPriceInput, showRequiredError)) {
            isFormValid = false;
        }
    } else {
        if (!goldPrices[document.querySelector('input[name="currency-tabs"]:checked').value]) {
            isFormValid = false;
        }
    }
    calculateCurrencyBtn.disabled = !isFormValid;
    return isFormValid;
}

function calculateAndSaveCurrency(showErrors = true) {
    if (!validateCurrencyForm(showErrors)) return;

    const currencyName = document.querySelector('input[name="currency-tabs"]:checked').value;
    const priceMode = document.querySelector('input[name="price-mode-tabs"]:checked').value;
    const amount = parseFloat(cleanNumber(currencyAmountInput.value));

    let price = 0;
    if (priceMode === 'manual') {
        price = parseFloat(cleanNumber(currencyManualPriceInput.value));
    } else {
        price = goldPrices[currencyName]?.price || 0;
    }

    if (amount > 0 && price > 0) {
        const finalValue = amount * price;
        const resultData = {
            goldType: 'ارز', // To use the same history system
            currencyName: currencyName,
            amount: amount,
            basePriceUsed: price,
            finalValue: finalValue,
            calcType: `با قیمت ${priceMode === 'live' ? 'لحظه‌ای' : 'دستی'}`
        };

        currencyResultDiv.innerHTML = `<p>${formatterPrice(amount)} ${currencyName} = <b>${formatterPrice(finalValue.toFixed(0))} تومان</b></p><p style="font-size:0.8rem; color: var(--text-light-color)">بر اساس قیمت هر واحد ${formatterPrice(price)} تومان</p>`;
        saveCalculation(resultData);
    }
}


function handleConversion() {
    const value = parseFloat(cleanNumber(converterValueInput.value)) || 0;
    if (value <= 0) {
        converterResultDiv.innerHTML = `<p>نتیجه تبدیل در اینجا نمایش داده می‌شود.</p>`;
        return;
    }
    const fromUnitRadio = document.querySelector('input[name="from-unit-tabs"]:checked');
    const toUnitRadio = document.querySelector('input[name="to-unit-tabs"]:checked');
    if (!fromUnitRadio || !toUnitRadio) return;
    const fromUnitValue = fromUnitRadio.value;
    const toUnitValue = toUnitRadio.value;
    const result = convertUnits(value, fromUnitValue, toUnitValue);
    const fromLabel = document.querySelector(`label[for="${fromUnitRadio.id}"]`).textContent;
    const toLabel = document.querySelector(`label[for="${toUnitRadio.id}"]`).textContent;
    converterResultDiv.innerHTML = `<p>${formatterPrice(value)} ${fromLabel} = <br><b>${formatterPrice(result.toFixed(4))} ${toLabel}</b></p>`;
}

function convertUnits(value, from, to) {
    const purities = { '705': 0.705, '750': 0.750, '999': 0.999 };
    const [fromType, fromKarat] = from.split('_');
    const pureGoldGrams = fromType === 'gram' ? value * purities[fromKarat] : (value * MESGHAL_TO_GRAM) * purities[fromKarat];
    const [toType, toKarat] = to.split('_');
    return toType === 'gram' ? pureGoldGrams / purities[toKarat] : (pureGoldGrams / purities[toKarat]) / MESGHAL_TO_GRAM;
}

function formatNumberInput(input) { let v = cleanNumber(input.value); if (v) input.value = new Intl.NumberFormat('en-US', { useGrouping: true }).format(v); }
function formatterPrice(p) { return (p === null || typeof p === 'undefined' || isNaN(p)) ? 'نامشخص' : new Intl.NumberFormat('fa-IR').format(p); }
function isValidInput(w, c) { return !isNaN(w) && !isNaN(c) && w > 0 && c <= 1000; }
function cleanNumber(s) { return String(s).replace(/,/g, ''); }