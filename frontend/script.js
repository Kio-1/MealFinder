const API_BASE_URL = "http://127.0.0.1:5000/api";
let currentUser = null;
let activeTags = [];
let weightChartInstance = null; 
let currentSearchResults = []; 

// ==========================================
// 1. AUTHENTICATION 
// ==========================================
document.getElementById('login-btn').addEventListener('click', async () => {
    const username = document.getElementById('login-username').value;
    if (!username) return;

    try {
        const response = await fetch(`${API_BASE_URL}/user/${username}`);
        if (response.ok) {
            const data = await response.json();
            loginSuccess(username, data.profile);
        } else {
            document.getElementById('auth-error').innerText = "User not found. Create a profile below.";
        }
    } catch (err) {
        document.getElementById('auth-error').innerText = "Error connecting to server.";
    }
});

document.getElementById('reg-btn').addEventListener('click', async () => {
    const username = document.getElementById('reg-username').value;
    const weight = document.getElementById('reg-weight').value;
    const goal = document.getElementById('reg-goal').value;
    if (!username || !weight || !goal) return;

    const response = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, weight, goal_weight: goal })
    });
    
    if (response.ok) {
        alert("Profile Created! You can now log in above.");
        document.getElementById('reg-username').value = '';
    }
});

function loginSuccess(username, profileData) {
    currentUser = username;
    document.getElementById('auth-screen').classList.add('hidden');
    document.getElementById('main-app').classList.remove('hidden');
    document.getElementById('current-user-display').innerText = `(${username})`;
    
    document.getElementById('plan-cal').value = profileData.macros.target_cals;
    document.getElementById('plan-pro').value = profileData.macros.target_pro;
    
    refreshUI(profileData);
}

function logout() {
    currentUser = null;
    document.getElementById('main-app').classList.add('hidden');
    document.getElementById('auth-screen').classList.remove('hidden');
    document.getElementById('login-username').value = '';
}

// ==========================================
// 2. DAILY TRACKER & LOCAL DATE LOGIC
// ==========================================
function refreshUI(profileData) {
    const dateObj = new Date();
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    const today = `${year}-${month}-${day}`; 
    
    const log = profileData.history[today] || [];
    let calsEaten = 0;
    let proEaten = 0;
    let mealsHtml = '';
    
    log.forEach((item, index) => {
        calsEaten += Number(item.calories);
        proEaten += Number(item.protein);
        mealsHtml += `
            <div class="card" style="display: flex; justify-content: space-between; padding: 1rem; margin-bottom: 0.5rem;">
                <span>✅ <strong>${item.name}</strong> (${item.calories} kcal | ${item.protein}g)</span>
                <button onclick="removeFood(${index})" style="background:transparent; border:none; color:#ff4444; cursor:pointer; font-size:1.2rem;" title="Remove Meal">❌</button>
            </div>
        `;
    });

    const calsTarget = profileData.macros.target_cals;
    const proTarget = profileData.macros.target_pro;

    document.getElementById('macro-display').innerHTML = `
        <h3 style="margin-top: 0;">${calsEaten} / ${calsTarget} Calories</h3>
        <div style="width: 100%; background: #333; height: 10px; border-radius: 5px; margin-bottom: 1rem;">
            <div style="width: ${Math.min((calsEaten/calsTarget)*100, 100)}%; background: var(--primary-color); height: 100%; border-radius: 5px; transition: width 0.3s ease;"></div>
        </div>
        <h3 style="margin-top: 0;">${proEaten} / ${proTarget}g Protein</h3>
        <div style="width: 100%; background: #333; height: 10px; border-radius: 5px;">
            <div style="width: ${Math.min((proEaten/proTarget)*100, 100)}%; background: var(--primary-color); height: 100%; border-radius: 5px; transition: width 0.3s ease;"></div>
        </div>
    `;
    document.getElementById('daily-log-container').innerHTML = log.length ? mealsHtml : "<p>No meals logged today.</p>";

    document.getElementById('update-weight').value = profileData.stats.weight;
    document.getElementById('update-goal').value = profileData.goals.goal_weight;
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

async function logCombo(mealNamesArray) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE_URL}/log-combo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, meals: mealNamesArray })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert("Entire combo logged successfully to your Tracker!");
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

// ==========================================
// 3. PROFILE & GRAPH LOGIC
// ==========================================
document.getElementById('update-profile-btn').addEventListener('click', async () => {
    const weight = document.getElementById('update-weight').value;
    const goal = document.getElementById('update-goal').value;
    if (!weight || !goal) return;

    const res = await fetch(`${API_BASE_URL}/update-profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, weight: weight, goal_weight: goal })
    });

    if (res.ok) {
        const data = await res.json();
        alert("Profile Updated!");
        document.getElementById('plan-cal').value = data.profile.macros.target_cals;
        document.getElementById('plan-pro').value = data.profile.macros.target_pro;
        refreshUI(data.profile);
    }
});

function renderGraph(weightHistory) {
    const ctx = document.getElementById('weightChart').getContext('2d');
    const rawDates = Object.keys(weightHistory);
    const labels = rawDates.map(dateStr => dateStr.split(' ')[0]); 
    const dataPoints = Object.values(weightHistory);

    if (weightChartInstance) { weightChartInstance.destroy(); }

    weightChartInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Weight (kg)',
                data: dataPoints,
                borderColor: '#00ff88',
                backgroundColor: 'rgba(0, 255, 136, 0.1)',
                borderWidth: 2,
                fill: true,
                tension: 0.3 
            }]
        },
        options: {
            responsive: true,
            scales: { y: { grid: { color: '#333' }, ticks: { color: '#a0a0a0' } }, x: { grid: { color: '#333' }, ticks: { color: '#a0a0a0' } } },
            plugins: { legend: { labels: { color: '#ffffff' } } }
        }
    });
}

// ==========================================
// 4. GROCERIES & WISHLIST LOGIC
// ==========================================
function renderWishlistAndGroceries(wishlist) {
    const wishlistContainer = document.getElementById('wishlist-render');
    const groceryContainer = document.getElementById('grocery-list-render');
    
    if (wishlist.length === 0) {
        wishlistContainer.innerHTML = "<p>No recipes saved yet.</p>";
        groceryContainer.innerHTML = "<p>Add recipes to your wishlist to generate a grocery list.</p>";
        return;
    }

    // Render Saved Recipes with the HTML <details> tag for steps
    wishlistContainer.innerHTML = wishlist.map((recipe, idx) => {
        let ingHtml = recipe.ingredients ? recipe.ingredients.map(i => `<li>${i}</li>`).join('') : '';
        let stepHtml = recipe.steps ? recipe.steps.map((s, i) => `<li>${s.charAt(0).toUpperCase() + s.slice(1)}</li>`).join('') : '';

        return `
        <div class="card" style="padding: 1rem; margin-bottom: 0.5rem; border-left: 3px solid var(--primary-color);">
            <div style="display: flex; justify-content: space-between; align-items: start;">
                <h4 style="margin: 0 0 0.5rem 0;">${recipe.name}</h4>
                <button onclick="toggleWishlistIndex(${idx})" style="background: transparent; color: #ff4444; border: 1px solid #ff4444; padding: 0.2rem 0.5rem;">Remove</button>
            </div>
            
            <details style="margin-top: 0.5rem; cursor: pointer;">
                <summary style="color: var(--primary-color); font-weight: bold; outline: none;">📖 View Recipe</summary>
                <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #333;">
                    <strong>Ingredients:</strong>
                    <ul style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">
                        ${ingHtml}
                    </ul>
                    <strong>Instructions:</strong>
                    <ol style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">
                        ${stepHtml}
                    </ol>
                </div>
            </details>
        </div>
        `;
    }).join('');

    let groceryMap = {};
    wishlist.forEach(recipe => {
        if (recipe.ingredients && Array.isArray(recipe.ingredients)) {
            recipe.ingredients.forEach(ingredient => {
                if(typeof ingredient !== 'string') return;
                let ingClean = ingredient.trim().charAt(0).toUpperCase() + ingredient.trim().slice(1);
                if(ingClean.length < 2) return;
                
                if (!groceryMap[ingClean]) groceryMap[ingClean] = [];
                groceryMap[ingClean].push(recipe.name);
            });
        }
    });

    const sortedIngredients = Object.keys(groceryMap).sort();
    groceryContainer.innerHTML = `
        <ul style="list-style-type: none; padding: 0; margin: 0;">
            ${sortedIngredients.map(ing => `
                <li style="border-bottom: 1px solid #333; padding: 0.75rem 0;">
                    <strong style="color: white; font-size: 1.1rem;">${ing}</strong><br>
                    <span style="font-size: 0.85rem; color: var(--primary-color);">Needed for: ${groceryMap[ing].join(', ')}</span>
                </li>
            `).join('')}
        </ul>
    `;
}

async function toggleWishlist(recipeObj) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE_URL}/wishlist/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, recipe: recipeObj })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
    }
}

function toggleWishlistIndex(index) {
    if(!currentUser) return;
    fetch(`${API_BASE_URL}/user/${currentUser}`)
        .then(r => r.json())
        .then(data => {
            const recipeToRemove = data.profile.wishlist[index];
            toggleWishlist(recipeToRemove);
        });
}

async function saveComboToWishlist(mealNamesArray) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE_URL}/wishlist/add-combo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, meals: mealNamesArray })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(data.message);
    }
}


// ==========================================
// 5. SEARCH & FILTERS
// ==========================================
function toggleTag(btnElement, tagString) {
    btnElement.classList.toggle('selected');
    if (activeTags.includes(tagString)) {
        activeTags = activeTags.filter(t => t !== tagString);
    } else {
        activeTags.push(tagString);
    }
}

document.getElementById('search-btn').addEventListener('click', async () => {
    const query = document.getElementById('search-input').value;
    const resultsContainer = document.getElementById('search-results');
    resultsContainer.innerHTML = "<p>Searching database...</p>";

    try {
        const response = await fetch(`${API_BASE_URL}/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: query, tags: activeTags })
        });
        
        const data = await response.json();
        if (!data.results || data.results.length === 0) {
            resultsContainer.innerHTML = "<p>No matches found.</p>";
            return;
        }

        currentSearchResults = data.results; 

        // Render Search Results with HTML <details> tag for steps
        resultsContainer.innerHTML = currentSearchResults.map((recipe, index) => {
            let ingHtml = recipe.ingredients ? recipe.ingredients.map(i => `<li>${i}</li>`).join('') : '';
            let stepHtml = recipe.steps ? recipe.steps.map((s, i) => `<li>${s.charAt(0).toUpperCase() + s.slice(1)}</li>`).join('') : '';

            return `
            <div class="card" style="margin-top: 1rem;">
                <h3 style="margin-top: 0; color: var(--primary-color);">${recipe.name}</h3>
                <p><strong>${recipe.calories} kcal</strong> | <strong>${recipe.protein}g Protein</strong> | ${recipe.minutes} mins</p>
                <p style="font-size: 0.9rem; color: var(--text-muted);">${recipe.description}</p>
                
                <details style="margin-top: 1rem; cursor: pointer;">
                    <summary style="color: var(--primary-color); font-weight: bold; outline: none;">📖 View Recipe</summary>
                    <div style="margin-top: 0.5rem; padding-top: 0.5rem; border-top: 1px solid #333;">
                        <strong>Ingredients:</strong>
                        <ul style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">
                            ${ingHtml}
                        </ul>
                        <strong>Instructions:</strong>
                        <ol style="color: var(--text-muted); font-size: 0.9rem; margin-top: 0.2rem;">
                            ${stepHtml}
                        </ol>
                    </div>
                </details>

                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick="quickLog('${recipe.name.replace(/'/g, "\\'")}', ${recipe.calories}, ${recipe.protein})" style="font-size: 0.8rem; padding: 0.5rem 1rem;">+ Add to Tracker</button>
                    <button onclick="saveRecipeFromSearch(${index})" style="background: transparent; color: white; border: 1px solid #333; font-size: 0.8rem; padding: 0.5rem 1rem;">❤️ Save to Groceries</button>
                </div>
            </div>
            `;
        }).join('');
    } catch (error) {
        resultsContainer.innerHTML = "<p style='color: #ff4444;'>Error connecting to server.</p>";
    }
});

function saveRecipeFromSearch(index) {
    const recipe = currentSearchResults[index];
    toggleWishlist(recipe);
    alert(`${recipe.name} added to Groceries!`);
}

async function quickLog(name, calories, protein) {
    if (!currentUser) return;
    const res = await fetch(`${API_BASE_URL}/log-food`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: currentUser, name: name, calories: calories, protein: protein })
    });
    if (res.ok) {
        const data = await res.json();
        refreshUI(data.profile);
        alert(`${name} logged for today!`);
    }
}

// ==========================================
// 6. PLANNER & NAVIGATION
// ==========================================
function switchTab(tabId) {
    document.querySelectorAll('.tab-content').forEach(t => { t.classList.remove('active'); t.classList.add('hidden'); });
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).classList.remove('hidden');
    document.getElementById(tabId).classList.add('active');
    event.currentTarget.classList.add('active');
}

document.getElementById('plan-btn').addEventListener('click', async () => {
    const calories = parseInt(document.getElementById('plan-cal').value);
    const protein = parseInt(document.getElementById('plan-pro').value);
    const meals = parseInt(document.getElementById('plan-meals').value);
    const resultsContainer = document.getElementById('plan-results');

    resultsContainer.innerHTML = "<p>Crunching numbers and simulating combinations...</p>";
    try {
        const response = await fetch(`${API_BASE_URL}/plan`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ calories, protein, meals })
        });
        const data = await response.json();
        
        if (data.results.length === 0) {
            resultsContainer.innerHTML = `<p>${data.message}</p>`;
            return;
        }

        resultsContainer.innerHTML = data.results.map((combo, index) => {
            let mealList = '';
            let mealNamesArray = [];
            for (let i = 1; i <= meals; i++) { 
                mealList += `<li>${combo[`Meal ${i}`]}</li>`; 
                mealNamesArray.push(combo[`Meal ${i}`]);
            }
            const arrayStringForJS = JSON.stringify(mealNamesArray).replace(/'/g, "\\'");

            return `
            <div class="card" style="margin-top: 1rem;">
                <h3 style="margin-top: 0; color: var(--primary-color);">Option ${index + 1}</h3>
                <p><strong>${combo['Total Calories']} kcal</strong> | <strong>${combo['Total Protein']}g Protein</strong></p>
                <ul style="color: var(--text-muted); line-height: 1.6;">${mealList}</ul>
                <div style="display: flex; gap: 0.5rem; margin-top: 1rem;">
                    <button onclick='logCombo(${arrayStringForJS})' style="flex: 1;">+ Log to Tracker</button>
                    <button onclick='saveComboToWishlist(${arrayStringForJS})' style="flex: 1; background: transparent; color: white; border: 1px solid #333;">❤️ Save to Groceries</button>
                </div>
            </div>`;
        }).join('');
    } catch (error) {
        resultsContainer.innerHTML = "<p style='color: #ff4444;'>Error connecting to server.</p>";
    }
});