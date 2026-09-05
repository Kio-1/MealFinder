const API_BASE_URL = "https://mealfinder-fi9a.onrender.com/api"; 
let currentUser = null;
let searchTags = [];
let planTags = [];
let weightChartInstance = null; 
let currentSearchResults = []; 
let currentPlanResults = [];
let currentPage = 1;
const RESULTS_PER_PAGE = 20;
let globalIngredientCount = 0;

// ==========================================
// 1. GLOBAL INITIALIZATION & THEME
// ==========================================
document.addEventListener('DOMContentLoaded', () => {
    // Load theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    
    // Attach Global Enter Key Listener to any input with class 'enter-submit'
    document.querySelectorAll('.enter-submit').forEach(input => {
        input.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const targetBtnId = this.getAttribute('data-target');
                if (targetBtnId) document.getElementById(targetBtnId).click();
            }
        });
    });
});

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
}

// ==========================================
// 2. LANDING PAGE & AUTH MODALS
// ==========================================
function showAuth(type) {
    document.getElementById('auth-modal').classList.remove('hidden');
    document.getElementById('auth-error').innerText = '';
    
    if (type === 'login') {
        document.getElementById('login-section').classList.remove('hidden');
        document.getElementById('register-section').classList.add('hidden');
        setTimeout(() => document.getElementById('login-username').focus(), 100);
    } else {
        document.getElementById('register-section').classList.remove('hidden');
        document.getElementById('login-section').classList.add('hidden');
        setTimeout(() => document.getElementById('reg-username').focus(), 100);
    }
}

function closeAuth() {
    document.getElementById('auth-modal').classList.add('hidden');
    document.getElementById('login-username').value = '';
    document.getElementById('login-pass').value = '';
    document.getElementById('auth-error').innerText = '';
}

// ==========================================
// 3. AUTHENTICATION LOGIC
// ==========================================
document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-pass').value;
    if (!username || !password) return;

    const btn = document.getElementById('login-btn');
    btn.innerText = "Logging in...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        if (response.ok) {
            loginSuccess(username, data.profile);
        } else {
            document.getElementById('auth-error').innerText = data.error || "Login failed.";
        }
    } catch (err) {
        document.getElementById('auth-error').innerText = "Error connecting to server.";
    } finally {
        btn.innerText = "Secure Login";
        btn.disabled = false;
    }
});

document.getElementById('reg-btn').addEventListener('click', async () => {
    const payload = {
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-pass').value,
        age: document.getElementById('reg-age').value,
        sex: document.getElementById('reg-gender').value,
        weight: document.getElementById('reg-weight').value,
        height: document.getElementById('reg-height').value,
        goal_weight: document.getElementById('reg-goal').value,
        activity: document.getElementById('reg-activity').value
    };

    if (!payload.username || !payload.password || !payload.weight || !payload.goal_weight || !payload.height) {
        alert("Please fill out all fields.");
        return;
    }

    const btn = document.getElementById('reg-btn');
    btn.innerText = "Creating...";
    btn.disabled = true;

    try {
        const response = await fetch(`${API_BASE_URL}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        
        const data = await response.json();
        if (response.ok) {
            alert("Secure Profile Created! Please log in.");
            showAuth('login');
        } else {
            alert(data.error || "Registration failed");
        }
    } catch(err) {
        alert("Server error.");
    } finally {
        btn.innerText = "Create Profile";
        btn.disabled = false;
    }
});

function loginSuccess(username, profileData) {
    currentUser = username;
    closeAuth();
    document.getElementById('landing-page').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('current-user-display').innerText = `(${username})`;
    
    document.getElementById('plan-cal').value = profileData.macros.target_cals;
    document.getElementById('plan-pro').value = profileData.macros.target_pro;
    
    refreshUI(profileData);
    switchTab('tracker');
}

function logout() {
    currentUser = null;
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('landing-page').classList.remove('hidden');
    
    // Clear sensitive fields
    document.querySelectorAll('input').forEach(input => input.value = '');
    document.getElementById('plan-meals').value = '3';
}

async function deleteAccount() {
    if (!currentUser) return;
    if (!confirm("Are you absolutely sure? All tracked data, custom profiles, and grocery lists will be permanently deleted.")) return;

    try {
        const res = await fetch(`${API_BASE_URL}/delete-account`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: currentUser })
        });
        if (res.ok) {
            alert("Account permanently deleted.");
            logout();
        } else {
            alert("Error deleting account.");
        }
    } catch(err) {
        alert("Server error during deletion.");
    }
}

// ==========================================
// 4. DAILY TRACKER & PROFILE UI
// ==========================================
function refreshUI(profileData) {
    const dateObj = new Date();
    const today = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, '0')}-${String(dateObj.getDate()).padStart(2, '0')}`; 
    
    const log = profileData.history[today] || [];
    let calsEaten = 0;
    let proEaten = 0;
    let mealsHtml = '';
    
    log.forEach((item, index) => {
        calsEaten += Number(item.calories);
        proEaten += Number(item.protein);
        mealsHtml += `
            <div class="card" style="display: flex; justify-content: space-between; align-items: center; padding: 1rem; margin-bottom: 0.5rem;">
                <span>✅ <strong>${item.name}</strong> (${item.calories} kcal | ${item.protein}g)</span>
                <button onclick="removeFood(${index})" style="background:transparent; border:none; color:var(--danger-color); cursor:pointer; font-size:1.2rem; padding: 0; box-shadow: none;" title="Remove Meal">❌</button>
            </div>
        `;
    });

    const calsTarget = profileData.macros.target_cals;
    const proTarget = profileData.macros.target_pro;

    document.getElementById('macro-display').innerHTML = `
        <h3 style="margin-top: 0;">${calsEaten} / ${calsTarget} Calories</h3>
        <div style="width: 100%; background: var(--surface-hover); height: 12px; border-radius: 6px; margin-bottom: 1rem; border: 1px solid var(--border-color);">
            <div style="width: ${Math.min((calsEaten/calsTarget)*100, 100)}%; background: var(--primary-color); height: 100%; border-radius: 5px; transition: width 0.4s ease;"></div>
        </div>
        <h3 style="margin-top: 0;">${proEaten} / ${proTarget}g Protein</h3>
        <div style="width: 100%; background: var(--surface-hover); height: 12px; border-radius: 6px; border: 1px solid var(--border-color);">
            <div style="width: ${Math.min((proEaten/proTarget)*100, 100)}%; background: var(--primary-color); height: 100%; border-radius: 5px; transition: width 0.4s ease;"></div>
        </div>
    `;
    document.getElementById('daily-log-container').innerHTML = log.length ? mealsHtml : "<p class='muted-text'>No meals logged today.</p>";

    // Profile Settings
    document.getElementById('update-age').value = profileData.stats.age || 19;
    document.getElementById('update-gender').value = profileData.stats.sex || 'Male';
    document.getElementById('update-weight').value = profileData.stats.weight;
    document.getElementById('update-height').value = profileData.stats.height || 181;
    document.getElementById('update-activity').value = profileData.stats.activity || 'Moderate';
    document.getElementById('update-goal').value = profileData.goals.goal_weight;
    
    // BMI
    const hMeters = (profileData.stats.height || 181) / 100;
    const bmi = (profileData.stats.weight / (hMeters * hMeters)).toFixed(1);
    let category = "Normal";
    if (bmi < 18.5) category = "Underweight";
    else if (bmi >= 25 && bmi < 30) category = "Overweight";
    else if (bmi >= 30) category = "Obese";

    document.getElementById('bmi-display').innerText = bmi;
    document.getElementById('bmi-category').innerText = category;

    renderGraph(profileData.weight_history);
    renderWishlistAndGroceries(profileData.wishlist || []);
}

document.getElementById('log-btn').addEventListener('click', async () => {
    const name = document.getElementById('manual-name').value;
    const cal = document.getElementById('manual-cal').value;
    const pro = document.getElementById('manual-pro').value;
    if (!name || !cal || !pro) return;

    const res = await fetch(`${API_BASE_URL}/log-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, name: name, calories: cal, protein: pro })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        document.getElementById('manual-name').value = '';
        document.getElementById('manual-cal').value = '';
        document.getElementById('manual-pro').value = '';
    }
});

async function logSingleMeal(name, cal, pro) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE_URL}/log-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, name: name, calories: cal, protein: pro })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(`${name} logged for today!`);
    }
}

async function removeFood(index) {
    const res = await fetch(`${API_BASE_URL}/remove-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, index: index })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
    }
}

document.getElementById('update-profile-btn').addEventListener('click', async () => {
    const payload = {
        username: currentUser,
        age: document.getElementById('update-age').value,
        sex: document.getElementById('update-gender').value,
        weight: document.getElementById('update-weight').value,
        height: document.getElementById('update-height').value,
        goal_weight: document.getElementById('update-goal').value,
        activity: document.getElementById('update-activity').value
    };

    const btn = document.getElementById('update-profile-btn');
    btn.innerText = "Saving...";
    
    const res = await fetch(`${API_BASE_URL}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
    });

    if (res.ok) {
        const data = await res.json();
        document.getElementById('plan-cal').value = data.profile.macros.target_cals;
        document.getElementById('plan-pro').value = data.profile.macros.target_pro;
        refreshUI(data.profile);
    }
    btn.innerText = "Recalculate Macros & Save";
});

function renderGraph(weightHistory) {
    const ctx = document.getElementById('weightChart').getContext('2d');
    const rawDates = Object.keys(weightHistory);
    const labels = rawDates.map(dateStr => dateStr.split(' ')[0]); 
    const dataPoints = Object.values(weightHistory);

    if (weightChartInstance) { weightChartInstance.destroy(); }
    
    const isLight = document.documentElement.getAttribute('data-theme') === 'light';
    const gridColor = isLight ? '#e0e0e0' : '#333333';
    const tickColor = isLight ? '#666666' : '#a0a0a0';

    weightChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: dataPoints,
                borderColor: '#00cc6a',
                backgroundColor: 'rgba(0, 204, 106, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#00cc6a'
            }]
        },
        options: {
            responsive: true,
            scales: { y: { grid: { color: gridColor }, ticks: { color: tickColor } }, x: { grid: { color: gridColor }, ticks: { color: tickColor } } },
            plugins: { legend: { labels: { color: tickColor } } }
        }
    });
}

// ==========================================
// 5. GROCERIES, WISHLIST & PRICING
// ==========================================
function parseArrayRobust(arr) {
    if (Array.isArray(arr)) return arr;
    if (typeof arr === 'string') {
        try { return JSON.parse(arr.replace(/'/g, '"')); } catch(e) { return [arr]; }
    }
    return [];
}

function renderWishlistAndGroceries(wishlist) {
    const wishlistContainer = document.getElementById('wishlist-render');
    const groceryContainer = document.getElementById('grocery-list-render');
    
    if (wishlist.length === 0) {
        wishlistContainer.innerHTML = "<p class='muted-text'>No recipes saved yet.</p>";
        groceryContainer.innerHTML = "<p class='muted-text'>Add recipes to your wishlist to generate a grocery list.</p>";
        document.getElementById('price-estimate').innerText = "";
        globalIngredientCount = 0;
        return;
    }

    wishlistContainer.innerHTML = wishlist.map((recipe, idx) => {
        let ingArray = parseArrayRobust(recipe.ingredients);
        let stepArray = parseArrayRobust(recipe.steps);
        let ingHtml = ingArray.map(i => `<li>${i}</li>`).join('');
        let stepHtml = stepArray.length > 0 ? stepArray.map(s => `<li>${s}</li>`).join('') : '<li>No instructions provided.</li>';

        return `
        <div class="card" style="padding: 1rem; margin-bottom: 0.5rem; border-left: 4px solid var(--primary-color);">
            <div class="flex-between" style="align-items: start; gap: 1rem;">
                <h4 style="margin: 0 0 0.5rem 0; color: var(--text-main);">${recipe.name}</h4>
                <button onclick="removeWishlistIndex(${idx})" style="background: transparent; color: var(--danger-color); border: 1px solid var(--danger-color); padding: 0.3rem 0.6rem; font-size: 0.8rem; box-shadow: none;">Remove</button>
            </div>
            
            <details style="margin-top: 0.5rem;">
                <summary>📖 View Recipe</summary>
                <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                    <strong class="text-main">Ingredients:</strong>
                    <ul class="muted-text" style="margin-top: 0.2rem;">${ingHtml}</ul>
                    <strong class="text-main">Instructions:</strong>
                    <ol class="muted-text" style="margin-top: 0.2rem;">${stepHtml}</ol>
                </div>
            </details>
        </div>
        `;
    }).join('');

    let groceryMap = {};
    wishlist.forEach(recipe => {
        let ingArray = parseArrayRobust(recipe.ingredients);
        ingArray.forEach(ingredient => {
            if(typeof ingredient !== 'string') return;
            let ingClean = ingredient.trim().charAt(0).toUpperCase() + ingredient.trim().slice(1);
            if(ingClean.length < 2) return;
            if (!groceryMap[ingClean]) groceryMap[ingClean] = [];
            groceryMap[ingClean].push(recipe.name);
        });
    });

    const sortedIngredients = Object.keys(groceryMap).sort();
    globalIngredientCount = sortedIngredients.length;
    
    groceryContainer.innerHTML = `
        <ul style="list-style-type: none; padding: 0; margin: 0;">
            ${sortedIngredients.map(ing => `
                <li style="border-bottom: 1px solid var(--border-color); padding: 0.75rem 0;">
                    <strong class="text-main" style="font-size: 1.1rem;">${ing}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--primary-color);">Needed for: ${groceryMap[ing].join(', ')}</span>
                </li>
            `).join('')}
        </ul>
    `;
    calculatePrice();
}

function calculatePrice() {
    if (globalIngredientCount === 0) return;
    const region = document.getElementById('currency-selector').value;
    let price = 0;
    let symbol = '';
    
    if (region === 'India') { price = globalIngredientCount * 45; symbol = 'Est: ₹'; }
    else if (region === 'USA') { price = globalIngredientCount * 2.50; symbol = 'Est: $'; }
    else if (region === 'UK') { price = globalIngredientCount * 1.50; symbol = 'Est: £'; }
    else if (region === 'Europe') { price = globalIngredientCount * 2.00; symbol = 'Est: €'; }
    
    document.getElementById('price-estimate').innerText = `${symbol}${price.toFixed(2)}`;
}

function removeWishlistIndex(index) {
    if(!currentUser) return;
    fetch(`${API_BASE_URL}/wishlist/remove`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, index: index })
    }).then(r => r.json()).then(data => {
        if(data.profile) refreshUI(data.profile);
    });
}

async function logPlanCombo(comboIndex) {
    if (!currentUser) return;
    const combo = currentPlanResults[comboIndex];
    const res = await fetch(`${API_BASE_URL}/log-combo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, meals: combo.meals })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert("Entire combo logged successfully to your Tracker!");
    }
}

async function savePlanComboToWishlist(comboIndex) {
    if (!currentUser) return;
    const combo = currentPlanResults[comboIndex];
    const res = await fetch(`${API_BASE_URL}/wishlist/add-combo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, meals: combo.meals })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(data.message);
    }
}

async function savePlanMealToWishlist(comboIndex, mealIndex) {
    if (!currentUser) return;
    const meal = currentPlanResults[comboIndex].meals[mealIndex];
    const res = await fetch(`${API_BASE_URL}/wishlist/add-combo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, meals: [meal] })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(`${meal.name} added to Groceries!`);
    }
}

async function saveSearchRecipeToWishlist(globalIndex) {
    if (!currentUser) return;
    const recipe = currentSearchResults[globalIndex];
    const res = await fetch(`${API_BASE_URL}/wishlist/add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, recipe: recipe })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(data.message);
    }
}

// ==========================================
// 6. SEARCH, FILTERS & PAGINATION
// ==========================================
function toggleTag(btnElement, context, tagString) {
    btnElement.classList.toggle('selected');
    let targetArray = context === 'search' ? searchTags : planTags;
    
    if (targetArray.includes(tagString)) {
        targetArray.splice(targetArray.indexOf(tagString), 1);
    } else {
        targetArray.push(tagString);
    }
}

document.getElementById('search-btn').addEventListener('click', async () => {
    const query = document.getElementById('search-input').value;
    const resultsContainer = document.getElementById('search-results');
    const paginationContainer = document.getElementById('pagination-controls');
    
    resultsContainer.innerHTML = "<p class='muted-text'>Searching database...</p>";
    paginationContainer.classList.add('hidden');

    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, tags: searchTags })
        });
        
        const data = await response.json();
        
        if (!response.ok && data.error) {
            resultsContainer.innerHTML = `<p class='error-text'>Backend Error: ${data.error}</p>`;
            return;
        }
        
        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = "<p class='muted-text'>No matches found.</p>";
            return;
        }

        currentSearchResults = data.results; 
        currentPage = 1;
        renderSearchResults();

    } catch (error) {
        resultsContainer.innerHTML = "<p class='error-text'>Error connecting to server. Render may be asleep, try again in 10 seconds.</p>";
    }
});

function renderSearchResults() {
    const resultsContainer = document.getElementById('search-results');
    const paginationContainer = document.getElementById('pagination-controls');
    
    const totalPages = Math.ceil(currentSearchResults.length / RESULTS_PER_PAGE);
    const startIdx = (currentPage - 1) * RESULTS_PER_PAGE;
    const endIdx = startIdx + RESULTS_PER_PAGE;
    const pageData = currentSearchResults.slice(startIdx, endIdx);

    resultsContainer.innerHTML = pageData.map((recipe, index) => {
        let ingArray = parseArrayRobust(recipe.ingredients);
        let stepArray = parseArrayRobust(recipe.steps);
        let ingHtml = ingArray.map(i => `<li>${i}</li>`).join('');
        let stepHtml = stepArray.length > 0 ? stepArray.map(s => `<li>${s}</li>`).join('') : '<li>No instructions provided.</li>';
        const globalIndex = startIdx + index;
        const safeName = recipe.name.replace(/'/g, "\\'");

        return `
        <div class="card fade-in">
            <h3 class="highlight-text" style="margin-bottom: 0.2rem;">${recipe.name}</h3>
            <p class="text-main" style="margin-top:0;"><strong>${recipe.calories} kcal</strong> | <strong>${recipe.protein}g Protein</strong> | ${recipe.minutes} mins</p>
            <p class="muted-text">${recipe.description}</p>
            
            <details>
                <summary>📖 View Recipe</summary>
                <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                    <strong class="text-main">Ingredients:</strong>
                    <ul class="muted-text" style="margin-top: 0.2rem;">${ingHtml}</ul>
                    <strong class="text-main">Instructions:</strong>
                    <ol class="muted-text" style="margin-top: 0.2rem;">${stepHtml}</ol>
                </div>
            </details>

            <div class="action-buttons">
                <button onclick="logSingleMeal('${safeName}', ${recipe.calories}, ${recipe.protein})">+ Add to Tracker</button>
                <button onclick="saveSearchRecipeToWishlist(${globalIndex})" class="btn-outline">❤️ Save to Groceries</button>
            </div>
        </div>
        `;
    }).join('');

    if (totalPages > 1) {
        paginationContainer.classList.remove('hidden');
        document.getElementById('page-indicator').innerText = `Tab ${currentPage} of ${totalPages}`;
        document.getElementById('prev-btn').disabled = currentPage === 1;
        document.getElementById('next-btn').disabled = currentPage === totalPages;
    } else {
        paginationContainer.classList.add('hidden');
    }
}

function changePage(direction) {
    const totalPages = Math.ceil(currentSearchResults.length / RESULTS_PER_PAGE);
    currentPage += direction;
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;
    renderSearchResults();
}

// ==========================================
// 7. PLANNER & NAVIGATION
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => { 
        t.classList.remove('active'); 
        t.classList.add('hidden'); 
    });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    
    document.getElementById(tabId).classList.remove('hidden');
    
    // Slight delay to re-trigger the fade-in animation
    setTimeout(() => {
        document.getElementById(tabId).classList.add('active');
    }, 10);
    
    event.currentTarget.classList.add('active');
}

document.getElementById('plan-btn').addEventListener('click', async () => {
    const calories = parseInt(document.getElementById('plan-cal').value);
    const protein = parseInt(document.getElementById('plan-pro').value);
    const meals = parseInt(document.getElementById('plan-meals').value);
    const resultsContainer = document.getElementById('plan-results');

    resultsContainer.innerHTML = "<p class='muted-text'>Crunching numbers and simulating combinations...</p>";
    try {
        const response = await fetch(`${API_BASE_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calories, protein, meals, tags: planTags })
        });
        const data = await response.json();
        
        if (data.results.length === 0) {
            resultsContainer.innerHTML = `<p class='error-text'>${data.message}</p>`;
            return;
        }

        currentPlanResults = data.results;

        resultsContainer.innerHTML = currentPlanResults.map((combo, comboIndex) => {
            let mealsHtml = combo.meals.map((mealObj, mIdx) => {
                let ingArray = parseArrayRobust(mealObj.ingredients);
                let stepArray = parseArrayRobust(mealObj.steps);
                let ingHtml = ingArray.map(i => `<li>${i}</li>`).join('');
                let stepHtml = stepArray.length > 0 ? stepArray.map(s => `<li>${s}</li>`).join('') : '<li>No instructions provided.</li>';
                const safeName = mealObj.name.replace(/'/g, "\\'");

                return `
                <div style="margin-bottom: 0.8rem; background: var(--surface-hover); padding: 0.5rem; border-radius: 8px; border: 1px solid var(--border-color);">
                    <details>
                        <summary>Meal ${mIdx + 1}: <span class="highlight-text">${mealObj.name}</span></summary>
                        <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid var(--border-color);">
                            <p class="muted-text" style="margin-bottom: 0.5rem;"><em>${mealObj.description}</em></p>
                            <strong class="text-main">Ingredients:</strong>
                            <ul class="muted-text" style="margin-top: 0.2rem;">${ingHtml}</ul>
                            <strong class="text-main">Instructions:</strong>
                            <ol class="muted-text" style="margin-top: 0.2rem;">${stepHtml}</ol>
                            
                            <div class="action-buttons">
                                <button onclick="logSingleMeal('${safeName}', ${mealObj.calories}, ${mealObj.protein})" style="font-size: 0.85rem;">+ Log Meal</button>
                                <button onclick="savePlanMealToWishlist(${comboIndex}, ${mIdx})" class="btn-outline" style="font-size: 0.85rem;">❤️ Save to Groceries</button>
                            </div>
                        </div>
                    </details>
                </div>`;
            }).join('');

            return `
            <div class="card fade-in">
                <h3 class="highlight-text" style="margin-bottom: 0.2rem;">Option ${comboIndex + 1}</h3>
                <p class="text-main" style="margin-top: 0; margin-bottom: 1rem;"><strong>${combo['Total Calories']} kcal</strong> | <strong>${combo['Total Protein']}g Protein</strong></p>
                
                ${mealsHtml}

                <div class="action-buttons">
                    <button onclick='logPlanCombo(${comboIndex})'>+ Log Combo to Tracker</button>
                    <button onclick='savePlanComboToWishlist(${comboIndex})' class="btn-outline">❤️ Save Combo to Groceries</button>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        resultsContainer.innerHTML = "<p class='error-text'>Error connecting to server. Render may be asleep, try again in a few seconds.</p>";
    }
});