from flask import Flask, request, jsonify
from flask_cors import CORS
from supabase import create_client, Client
import ast
import random
from datetime import datetime
import os
import re

app = Flask(__name__)
CORS(app)

# ==========================================
# SUPABASE DATABASE INITIALIZATION
# ==========================================
SUPABASE_URL = os.environ.get("SUPABASE_URL", "YOUR_SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "YOUR_SUPABASE_SERVICE_ROLE_KEY")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)
print("Connected to Supabase. Fully Cloud-Native Backend Ready!")

# ==========================================
# HELPER FUNCTIONS
# ==========================================
def load_user(username):
    res = supabase.table('users').select('profile_data').eq('username', username).execute()
    if res.data:
        return res.data[0]['profile_data']
    return None

def save_user(username, profile_data):
    supabase.table('users').update({'profile_data': profile_data}).eq('username', username).execute()

def safe_parse_list(val):
    if val is None:
        return []
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

def calculate_macros(weight, height, age, sex, activity, goal_weight):
    if sex == "Male":
        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
    else:
        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
        
    multipliers = {
        "Sedentary": 1.2,
        "Light": 1.375,
        "Moderate": 1.55,
        "Active": 1.725,
        "Very Active": 1.9
    }
    maintenance = bmr * multipliers.get(activity, 1.55)
    
    target_cals = int(maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance)
    target_pro = int(weight * 2)
    return target_cals, target_pro

# ==========================================
# AUTHENTICATION ENDPOINTS
# ==========================================
@app.route('/api/status', methods=['GET'])
def status():
    return jsonify({"status": "MealFinder Backend Online"})

@app.route('/api/user/<username>', methods=['GET'])
def get_user_profile(username):
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"profile": profile})

@app.route('/api/login', methods=['POST'])
def login():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    
    res = supabase.table('users').select('password, profile_data').eq('username', username).execute()
    if not res.data:
        return jsonify({"error": "User not found."}), 404
    if res.data[0]['password'] != password:
        return jsonify({"error": "Incorrect password."}), 401
    return jsonify({"profile": res.data[0]['profile_data']})

@app.route('/api/register', methods=['POST'])
def register():
    data = request.json or {}
    username = data.get('username')
    password = data.get('password')
    sex = data.get('sex', 'Male')
    age = int(data.get('age', 19))
    height = float(data.get('height', 181))
    weight = float(data.get('weight', 88))
    goal_weight = float(data.get('goal_weight', 80))
    activity = data.get('activity', 'Moderate')
    
    res = supabase.table('users').select('username').eq('username', username).execute()
    if res.data:
        return jsonify({"error": "Username exists!"}), 400

    target_cals, target_pro = calculate_macros(weight, height, age, sex, activity, goal_weight)
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    profile_data = {
        "stats": {"sex": sex, "age": age, "height": height, "weight": weight, "activity": activity},
        "goals": {"goal_weight": goal_weight},
        "macros": {"target_cals": target_cals, "target_pro": target_pro},
        "history": {},
        "weight_history": {now_str: weight},
        "wishlist": []
    }
    
    try:
        supabase.table('users').insert({'username': username, 'password': password, 'profile_data': profile_data}).execute()
        return jsonify({"message": "Profile created!"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/update-profile', methods=['POST'])
def update_profile():
    data = request.json or {}
    username = data.get('username')
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404

    stats = profile.get('stats', {})
    stats['weight'] = float(data.get('weight', stats.get('weight', 0)))
    stats['height'] = float(data.get('height', stats.get('height', 181)))
    stats['age'] = int(data.get('age', stats.get('age', 19)))
    stats['sex'] = data.get('sex', stats.get('sex', 'Male'))
    stats['activity'] = data.get('activity', stats.get('activity', 'Moderate'))
    goal_weight = float(data.get('goal_weight', profile.get('goals', {}).get('goal_weight', 0)))

    target_cals, target_pro = calculate_macros(stats['weight'], stats['height'], stats['age'], stats['sex'], stats['activity'], goal_weight)

    profile['stats'] = stats
    profile['goals']['goal_weight'] = goal_weight
    profile['macros'] = {"target_cals": target_cals, "target_pro": target_pro}

    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    profile['weight_history'][now_str] = stats['weight']

    save_user(username, profile)
    return jsonify({"message": "Profile updated!", "profile": profile})

# ==========================================
# TRACKER ENDPOINTS
# ==========================================
@app.route('/api/log-food', methods=['POST'])
def log_food():
    data = request.json or {}
    username = data.get('username')
    today = datetime.now().strftime("%Y-%m-%d")
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404

    if today not in profile['history']:
        profile['history'][today] = []

    profile['history'][today].append({
        "name": data.get('name'),
        "calories": int(data.get('calories', 0)),
        "protein": int(data.get('protein', 0))
    })
    save_user(username, profile)
    return jsonify({"message": "Logged successfully!", "profile": profile})

@app.route('/api/log-combo', methods=['POST'])
def log_combo():
    data = request.json or {}
    username = data.get('username')
    meals = data.get('meals', [])
    today = datetime.now().strftime("%Y-%m-%d")
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404

    if today not in profile['history']:
        profile['history'][today] = []

    for meal in meals:
        profile['history'][today].append({
            "name": meal.get('name', 'Unknown Meal'),
            "calories": int(meal.get('calories', 0)),
            "protein": int(meal.get('protein', 0))
        })
            
    save_user(username, profile)
    return jsonify({"message": "Combo logged successfully!", "profile": profile})

@app.route('/api/remove-food', methods=['POST'])
def remove_food():
    data = request.json or {}
    username = data.get('username')
    index = data.get('index')
    today = datetime.now().strftime("%Y-%m-%d")
    
    profile = load_user(username)
    if profile and today in profile.get('history', {}):
        try:
            profile['history'][today].pop(index)
            save_user(username, profile)
            return jsonify({"message": "Food removed!", "profile": profile})
        except (IndexError, TypeError):
            return jsonify({"error": "Invalid meal index"}), 400
    return jsonify({"error": "Record not found"}), 404

# ==========================================
# WISHLIST / GROCERIES ENDPOINTS
# ==========================================
@app.route('/api/wishlist/add', methods=['POST'])
def add_wishlist():
    data = request.json or {}
    username = data.get('username')
    recipe = data.get('recipe', {})
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404
        
    wishlist = profile.get('wishlist', [])
    exists = any(r.get('name') == recipe.get('name') for r in wishlist)
    
    if not exists:
        profile['wishlist'].append(recipe)
        save_user(username, profile)
        return jsonify({"message": f"{recipe.get('name')} added to Groceries!", "profile": profile})
    else:
        return jsonify({"message": "Already in Groceries!", "profile": profile})

@app.route('/api/wishlist/remove', methods=['POST'])
def remove_wishlist():
    data = request.json or {}
    username = data.get('username')
    index = data.get('index')
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404
        
    if 'wishlist' in profile:
        try:
            profile['wishlist'].pop(index)
            save_user(username, profile)
            return jsonify({"message": "Removed from Groceries!", "profile": profile})
        except IndexError:
            pass
            
    return jsonify({"error": "Invalid index", "profile": profile}), 400

@app.route('/api/wishlist/add-combo', methods=['POST'])
def add_combo_wishlist():
    data = request.json or {}
    username = data.get('username')
    meals = data.get('meals', [])
    
    profile = load_user(username)
    if not profile:
        return jsonify({"error": "User not found"}), 404
        
    wishlist = profile.get('wishlist', [])
    added_count = 0
    
    for meal in meals:
        if not any(r.get('name') == meal.get('name') for r in wishlist):
            profile['wishlist'].append(meal)
            added_count += 1
                
    save_user(username, profile)
    return jsonify({"message": f"{added_count} new meals added to Groceries!", "profile": profile})

# ==========================================
# SEARCH & PLANNER ENGINE
# ==========================================
@app.route('/api/search', methods=['POST'])
def search():
    data = request.json or {}
    query = data.get('query', '').strip()
    tags_filter = data.get('tags', [])
    top_n = 100 

    try:
        req = supabase.table('recipes').select(
            'name, calories, protein, minutes, description, ingredients, steps, tags'
        ).limit(top_n)
        
        if query:
            safe_words = re.findall(r'\w+', query)
            formatted_query = ' & '.join(safe_words)
            if formatted_query:
                req = req.text_search('search_vector', formatted_query)
            
        if tags_filter:
            req = req.contains('tags', tags_filter)
            
        res = req.execute()
        results = res.data

        for r in results:
            r['ingredients'] = safe_parse_list(r.get('ingredients', []))
            r['steps'] = safe_parse_list(r.get('steps', []))
            r['calories'] = int(r.get('calories', 0) or 0)
            r['protein'] = int(r.get('protein', 0) or 0)
            r['minutes'] = int(r.get('minutes', 0) or 0)
            r['description'] = str(r.get('description', ''))

        results.sort(key=lambda x: x['name'])
        return jsonify({"results": results})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/plan', methods=['POST'])
def plan():
    data = request.json or {}
    target_cal = int(data.get('calories', 2000))
    target_pro = int(data.get('protein', 120))
    num_meals = int(data.get('meals', 3))
    tags_filter = data.get('tags', []) 

    max_db_id = 195644 
    random_ids = random.sample(range(1, max_db_id), 1500)
    
    try:
        response = supabase.table('recipes') \
            .select('name, calories, protein, description, minutes, ingredients, steps, tags') \
            .in_('id', random_ids) \
            .execute()
        candidate_pool = response.data
    except Exception as e:
        return jsonify({"results": [], "message": f"Database query failed: {str(e)}"}), 500

    if tags_filter:
        filtered_pool = []
        for recipe in candidate_pool:
            recipe_tags = recipe.get('tags', []) or []
            if any(req_tag in recipe_tags for req_tag in tags_filter):
                filtered_pool.append(recipe)
        candidate_pool = filtered_pool

    if not candidate_pool or len(candidate_pool) < num_meals:
        return jsonify({"results": [], "message": "No meals found matching those specific filters."})

    valid_combos = []
    simulations = 2500

    for _ in range(simulations):
        sampled_meals = random.sample(candidate_pool, num_meals)
        tot_cals = sum(int(m.get('calories', 0) or 0) for m in sampled_meals)
        tot_pro = sum(int(m.get('protein', 0) or 0) for m in sampled_meals)

        if (target_cal - 150 <= tot_cals <= target_cal + 150) and (target_pro - 15 <= tot_pro <= target_pro + 15):
            error_score = abs(tot_cals - target_cal) + (abs(tot_pro - target_pro) * 10)
            
            combo_obj = {
                "Total Calories": tot_cals,
                "Total Protein": tot_pro,
                "_error": error_score,
                "meals": []
            }
            for meal in sampled_meals:
                combo_obj["meals"].append({
                    "name": meal.get('name'),
                    "calories": int(meal.get('calories', 0) or 0),
                    "protein": int(meal.get('protein', 0) or 0),
                    "minutes": int(meal.get('minutes', 0) or 0),
                    "description": str(meal.get('description', '')),
                    "ingredients": safe_parse_list(meal.get('ingredients', [])),
                    "steps": safe_parse_list(meal.get('steps', []))
                })
            valid_combos.append(combo_obj)

    if not valid_combos:
        return jsonify({"results": [], "message": "No combinations found matching exact targets. Adjust macros or remove filters."})

    valid_combos.sort(key=lambda x: x['_error'])
    top_combos = valid_combos[:5]
    for combo in top_combos:
        combo.pop('_error', None)

    return jsonify({"results": top_combos})

if __name__ == '__main__':
    app.run(debug=True, port=5000)