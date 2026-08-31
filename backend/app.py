from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import json
import ast
import random
from datetime import datetime
import os

app = Flask(__name__)
CORS(app)

# ==========================================
# SUPABASE DATABASE INITIALIZATION
# ==========================================
# Reads credentials from environment variables (fallback for local development)
SUPABASE_URL = os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("Connected to Supabase. Lightweight Backend Ready!")

# ==========================================
# LOCAL USER SESSION HELPERS
# ==========================================
USERS_FILE = 'users.json'

def load_users():
    if not os.path.exists(USERS_FILE):
        return {}
    try:
        with open(USERS_FILE, 'r') as f:
            return json.load(f)
    except Exception:
        return {}

def save_users(data):
    with open(USERS_FILE, 'w') as f:
        json.dump(data, f, indent=4)

def safe_parse_list(val):
    if isinstance(val, list):
        return [str(i).strip() for i in val if str(i).strip()]
    if isinstance(val, str):
        try:
            parsed = ast.literal_eval(val)
            if isinstance(parsed, list):
                return [str(i).strip() for i in parsed if str(i).strip()]
        except Exception:
            pass
        cleaned = val.replace('[', '').replace(']', '').replace("'", "").replace('"', '')
        if ',' in cleaned:
            return [i.strip() for i in cleaned.split(',') if i.strip()]
        return [cleaned.strip()] if cleaned.strip() else []
    return []

# ==========================================
# API ENDPOINTS
# ==========================================
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "MealFinder Backend Online (Powered by Supabase BM25)"})

@app.route('/api/user/<username>', methods=['GET'])
def get_user_profile(username):
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"profile": users_db[username]})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username')
    sex = data.get('sex', 'Male')
    age = int(data.get('age', 19))
    height = float(data.get('height', 181))
    weight = float(data.get('weight', 88))
    goal_weight = float(data.get('goal_weight', 80))
    activity = data.get('activity', 'Medium')
    
    users_db = load_users()
    if username in users_db:
        return jsonify({"error": "Username exists!"}), 400

    bmr = (10 * weight) + (6.25 * height) - (5 * age) + (5 if sex == "Male" else -161)
    maintenance = bmr * 1.55
    target_cals = int(maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance)
    target_pro = int(weight * 2)
    
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    users_db[username] = {
        "stats": {"sex": sex, "age": age, "height": height, "weight": weight, "activity": activity},
        "goals": {"goal_weight": goal_weight},
        "macros": {"target_cals": target_cals, "target_pro": target_pro},
        "history": {},
        "weight_history": {now_str: weight},
        "wishlist": []
    }
    save_users(users_db)
    return jsonify({"message": "Profile created!"})

@app.route('/api/update-profile', methods=['POST'])
def update_profile():
    data = request.json or {}
    username = data.get('username')
    weight = float(data.get('weight', 0))
    goal_weight = float(data.get('goal_weight', 0))
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    stats = users_db[username]['stats']
    bmr = (10 * weight) + (6.25 * stats['height']) - (5 * stats['age']) + (5 if stats.get('sex') == "Male" else -161)
    maintenance = bmr * 1.55
    
    target_cals = int(maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance)
    target_pro = int(weight * 2)

    users_db[username]['stats']['weight'] = weight
    users_db[username]['goals']['goal_weight'] = goal_weight
    users_db[username]['macros'] = {"target_cals": target_cals, "target_pro": target_pro}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    users_db[username]['weight_history'][now_str] = weight

    save_users(users_db)
    return jsonify({"message": "Profile updated!", "profile": users_db[username]})

@app.route('/api/log-food', methods=['POST'])
def log_food():
    data = request.json or {}
    username = data.get('username')
    today = datetime.now().strftime("%Y-%m-%d")
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    if today not in users_db[username]['history']:
        users_db[username]['history'][today] = []

    users_db[username]['history'][today].append({
        "name": data.get('name'),
        "calories": int(data.get('calories', 0)),
        "protein": int(data.get('protein', 0))
    })
    save_users(users_db)
    return jsonify({"message": "Logged successfully!", "profile": users_db[username]})

@app.route('/api/log-combo', methods=['POST'])
def log_combo():
    data = request.json or {}
    username = data.get('username')
    meal_names = data.get('meals', [])
    today = datetime.now().strftime("%Y-%m-%d")
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    if today not in users_db[username]['history']:
        users_db[username]['history'][today] = []

    # Query matching recipes from Supabase
    if meal_names:
        response = supabase.table('recipes').select('name, calories, protein').in_('name', meal_names).execute()
        for recipe in response.data:
            users_db[username]['history'][today].append({
                "name": recipe['name'],
                "calories": int(recipe.get('calories', 0) or 0),
                "protein": int(recipe.get('protein', 0) or 0)
            })
            
    save_users(users_db)
    return jsonify({"message": "Combo logged successfully!", "profile": users_db[username]})

@app.route('/api/remove-food', methods=['POST'])
def remove_food():
    data = request.json or {}
    username = data.get('username')
    index = data.get('index')
    
    users_db = load_users()
    today = datetime.now().strftime("%Y-%m-%d")

    if username in users_db and today in users_db[username]['history']:
        try:
            users_db[username]['history'][today].pop(index)
            save_users(users_db)
            return jsonify({"message": "Food removed!", "profile": users_db[username]})
        except (IndexError, TypeError):
            return jsonify({"error": "Invalid meal index"}), 400

    return jsonify({"error": "Record not found"}), 404

@app.route('/api/log-weight', methods=['POST'])
def log_weight():
    data = request.json or {}
    username = data.get('username')
    new_weight = float(data.get('weight', 0))

    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    users_db[username]['stats']['weight'] = new_weight
    users_db[username]['weight_history'][now_str] = new_weight

    save_users(users_db)
    return jsonify({"message": "Weight logged!", "profile": users_db[username]})

@app.route('/api/wishlist/toggle', methods=['POST'])
def toggle_wishlist():
    data = request.json or {}
    username = data.get('username')
    recipe = data.get('recipe', {})
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
        
    if 'wishlist' not in users_db[username]:
        users_db[username]['wishlist'] = []
        
    wishlist = users_db[username]['wishlist']
    exists = any(r.get('name') == recipe.get('name') for r in wishlist)
    
    if exists:
        users_db[username]['wishlist'] = [r for r in wishlist if r.get('name') != recipe.get('name')]
    else:
        users_db[username]['wishlist'].append(recipe)
        
    save_users(users_db)
    return jsonify({"message": "Wishlist updated!", "profile": users_db[username]})

@app.route('/api/wishlist/add-combo', methods=['POST'])
def add_combo_wishlist():
    data = request.json or {}
    username = data.get('username')
    meal_names = data.get('meals', [])
    
    users_db = load_users()
    if username not in users_db:
        return jsonify({"error": "User not found"}), 404
        
    if 'wishlist' not in users_db[username]:
        users_db[username]['wishlist'] = []
        
    wishlist = users_db[username]['wishlist']
    added_count = 0
    
    if meal_names:
        response = supabase.table('recipes').select('*').in_('name', meal_names).execute()
        for row in response.data:
            if not any(r.get('name') == row.get('name') for r in wishlist):
                recipe_obj = {
                    "name": str(row.get("name", "")),
                    "calories": int(row.get("calories", 0) or 0),
                    "protein": int(row.get("protein", 0) or 0),
                    "minutes": int(row.get("minutes", 0) or 0),
                    "description": str(row.get("description", "")),
                    "ingredients": safe_parse_list(row.get("ingredients", [])),
                    "steps": safe_parse_list(row.get("steps", []))
                }
                users_db[username]['wishlist'].append(recipe_obj)
                added_count += 1
                
    save_users(users_db)
    return jsonify({"message": f"{added_count} new meals added to Groceries!", "profile": users_db[username]})

# ==========================================
# FULL-TEXT BM25 SEARCH (SUPABASE ENGINE)
# ==========================================
@app.route('/api/search', methods=['POST'])
def search():
    data = request.json or {}
    query = data.get('query', '').strip()
    tags_filter = data.get('tags', [])
    top_n = 10

    results = []

    # 1. Exact Name Matching
    if query:
        exact_res = supabase.table('recipes') \
            .select('name, calories, protein, minutes, description, ingredients, steps, tags') \
            .ilike('name', f"%{query}%") \
            .limit(top_n) \
            .execute()
        results.extend(exact_res.data)

    # 2. BM25 Text Search via Generated Search Vector
    search_terms = f"{query} {' '.join(tags_filter)}".strip()
    if search_terms:
        # Format query for PostgreSQL textsearch
        formatted_query = ' & '.join(search_terms.replace("'", "").split())
        if formatted_query:
            try:
                fts_res = supabase.table('recipes') \
                    .select('name, calories, protein, minutes, description, ingredients, steps, tags') \
                    .text_search('search_vector', formatted_query) \
                    .limit(top_n) \
                    .execute()
                results.extend(fts_res.data)
            except Exception:
                pass

    # 3. Tag Fallback if search string is empty
    if not results and tags_filter:
        tag_res = supabase.table('recipes') \
            .select('name, calories, protein, minutes, description, ingredients, steps, tags') \
            .contains('tags', tags_filter) \
            .limit(top_n) \
            .execute()
        results.extend(tag_res.data)

    # Deduplicate results while preserving rank order
    seen = set()
    deduped_results = []
    for r in results:
        if r['name'] not in seen:
            seen.add(r['name'])
            # Ensure lists are strictly clean
            r['ingredients'] = safe_parse_list(r.get('ingredients', []))
            r['steps'] = safe_parse_list(r.get('steps', []))
            r['calories'] = int(r.get('calories', 0) or 0)
            r['protein'] = int(r.get('protein', 0) or 0)
            r['minutes'] = int(r.get('minutes', 0) or 0)
            deduped_results.append(r)
        if len(deduped_results) >= top_n:
            break

    return jsonify({"results": deduped_results})

# ==========================================
# MONTE CARLO COMBINATORIAL MEAL PLANNER
# ==========================================
@app.route('/api/plan', methods=['POST'])
def plan():
    data = request.json or {}
    target_cal = int(data.get('calories', 2000))
    target_pro = int(data.get('protein', 120))
    num_meals = int(data.get('meals', 3))

    # Fetch a lightweight candidate pool of 400 random recipes directly from Postgres
    try:
        response = supabase.rpc('get_random_recipes', {'sample_size': 400}).execute()
        candidate_pool = response.data
    except Exception as e:
        return jsonify({"results": [], "message": f"Database query failed: {str(e)}"}), 500

    if not candidate_pool or len(candidate_pool) < num_meals:
        return jsonify({"results": [], "message": "Insufficient recipe sample."})

    # Vectorized Stochastic Simulation in Pure Python (<10ms execution, ~0 MB RAM overhead)
    valid_combos = []
    simulations = 2500

    for _ in range(simulations):
        sampled_meals = random.sample(candidate_pool, num_meals)
        tot_cals = sum(int(m.get('calories', 0) or 0) for m in sampled_meals)
        tot_pro = sum(int(m.get('protein', 0) or 0) for m in sampled_meals)

        # Strict Macro Window Filtering
        if (target_cal - 150 <= tot_cals <= target_cal + 150) and (target_pro - 15 <= tot_pro <= target_pro + 15):
            error_score = abs(tot_cals - target_cal) + (abs(tot_pro - target_pro) * 10)
            combo_obj = {
                "Total Calories": tot_cals,
                "Total Protein": tot_pro,
                "_error": error_score
            }
            for i, meal in enumerate(sampled_meals):
                combo_obj[f"Meal {i+1}"] = meal.get('name')
            valid_combos.append(combo_obj)

    if not valid_combos:
        # Fallback: Relax tolerance slightly if no combinations hit the tight window
        for _ in range(1500):
            sampled_meals = random.sample(candidate_pool, num_meals)
            tot_cals = sum(int(m.get('calories', 0) or 0) for m in sampled_meals)
            tot_pro = sum(int(m.get('protein', 0) or 0) for m in sampled_meals)
            if (target_cal - 300 <= tot_cals <= target_cal + 300) and (target_pro - 30 <= tot_pro <= target_pro + 30):
                error_score = abs(tot_cals - target_cal) + (abs(tot_pro - target_pro) * 10)
                combo_obj = {
                    "Total Calories": tot_cals,
                    "Total Protein": tot_pro,
                    "_error": error_score
                }
                for i, meal in enumerate(sampled_meals):
                    combo_obj[f"Meal {i+1}"] = meal.get('name')
                valid_combos.append(combo_obj)

    if not valid_combos:
        return jsonify({"results": [], "message": "No combinations found matching those exact targets."})

    # Sort by lowest error penalty score and slice the top 5
    valid_combos.sort(key=lambda x: x['_error'])
    top_combos = valid_combos[:5]

    for combo in top_combos:
        combo.pop('_error', None)

    return jsonify({"results": top_combos})

if __name__ == '__main__':
    app.run(debug=True, port=5000)