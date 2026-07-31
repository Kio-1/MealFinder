import streamlit as st
import pandas as pd
import numpy as np
import pickle
import ast
import json
import scipy.sparse
from datetime import datetime

st.set_page_config(page_title="MealFinder", layout="wide")

# --- BULLETPROOF LIST PARSER ---
def safe_parse_list(val):
    if isinstance(val, list):
        return [str(i).strip() for i in val]
    if isinstance(val, np.ndarray):
        return [str(i).strip() for i in val.tolist()]
    if isinstance(val, str):
        try:
            parsed = ast.literal_eval(val)
            if isinstance(parsed, list):
                return [str(i).strip() for i in parsed]
        except:
            pass
        cleaned = val.replace('[', '').replace(']', '').replace("'", "").replace('"', '')
        if ',' in cleaned:
            return [i.strip() for i in cleaned.split(',') if i.strip()]
        return [cleaned.strip()]
    return []

# --- DATABASE SIMULATION (JSON) ---
def load_users():
    try:
        with open('users.json', 'r') as f:
            return json.load(f)
    except FileNotFoundError:
        return {}

def save_users(data):
    with open('users.json', 'w') as f:
        json.dump(data, f, indent=4)

# --- INITIALIZE MEMORY STATE ---
# We use session_state so Streamlit doesn't forget data when the page reruns
if 'current_user' not in st.session_state:
    st.session_state['current_user'] = None
if 'combo_results' not in st.session_state:
    st.session_state['combo_results'] = None
if 'n_meals_memory' not in st.session_state:
    st.session_state['n_meals_memory'] = 3
if 'search_results' not in st.session_state:
    st.session_state['search_results'] = None

users_db = load_users()

for username in users_db:
    if 'wishlist' not in users_db[username]:
        users_db[username]['wishlist'] = []
save_users(users_db)

# --- LOAD COMPRESSED DATA ---
@st.cache_data
def load_data():
    return pd.read_parquet('data/cleaned_recipes.parquet')

@st.cache_resource
def load_models():
    with open('data/vectorizer.pkl', 'rb') as f:
        vec = pickle.load(f)
    matrix = scipy.sparse.load_npz('data/tfidf_matrix.npz')
    return vec, matrix

df = load_data()
vectorizer, tfidf_matrix = load_models()

# --- HIGH-SPEED SEARCH ENGINE LOGIC ---
# Using @st.cache_data means Streamlit skips the math if you search the exact same thing twice
@st.cache_data
def search_recipes(query, tags_filter_tuple, top_n=10):
    tags_filter = list(tags_filter_tuple) # Convert tuple back to list for processing
    query_to_search = query if query else ""
    if tags_filter:
        query_to_search = query_to_search + ' ' + ' '.join(tags_filter)

    exact_matches = pd.DataFrame()
    if query:
        exact_mask = df['name'].str.contains(query, case=False, na=False)
        exact_matches = df[exact_mask].copy()
        
        if not exact_matches.empty:
            exact_matches['name_length'] = exact_matches['name'].str.len()
            exact_matches = exact_matches.sort_values('name_length').drop(columns=['name_length'])
            
            if tags_filter:
                mask = exact_matches['tags'].apply(lambda recipe_tags: any(tag in recipe_tags for tag in tags_filter))
                exact_matches = exact_matches[mask]

    query_vec = vectorizer.transform([query_to_search])
    similarity_scores = tfidf_matrix.dot(query_vec.T).toarray().flatten()
    
    math_matches = pd.DataFrame()
    if np.max(similarity_scores) > 0:
        top_indices_unordered = np.argpartition(similarity_scores, -top_n)[-top_n:]
        top_indices_sorted = top_indices_unordered[np.argsort(similarity_scores[top_indices_unordered])[::-1]]
        math_matches = df.iloc[top_indices_sorted].copy()

    results = pd.concat([exact_matches, math_matches]).drop_duplicates(subset=['name']).head(top_n)
    return results

@st.cache_data
def get_similar_recipes(recipe_index, top_n=5):
    target_vec = tfidf_matrix[recipe_index]
    similarity_scores = tfidf_matrix.dot(target_vec.T).toarray().flatten()
    top_indices_unordered = np.argpartition(similarity_scores, -(top_n + 1))[-(top_n + 1):]
    top_indices_sorted = top_indices_unordered[np.argsort(similarity_scores[top_indices_unordered])[::-1]]
    top_indices_sorted = top_indices_sorted[top_indices_sorted != recipe_index][:top_n]
    return df.iloc[top_indices_sorted][['name', 'calories', 'protein', 'minutes']]

def generate_dynamic_combo(target_cal, target_pro, num_meals, cal_tol=150, pro_tol=15):
    simulations = 2000
    samples = [df.sample(simulations, replace=True).reset_index(drop=True) for _ in range(num_meals)]
    
    total_cals = sum(sample['calories'] for sample in samples)
    total_pro = sum(sample['protein'] for sample in samples)
    
    combos = pd.DataFrame({'Total Calories': total_cals, 'Total Protein': total_pro})
    for i in range(num_meals):
        combos[f'Meal {i+1}'] = samples[i]['name']
        
    valid = combos[
        (combos['Total Calories'] >= target_cal - cal_tol) &
        (combos['Total Calories'] <= target_cal + cal_tol) &
        (combos['Total Protein'] >= target_pro - pro_tol) &
        (combos['Total Protein'] <= target_pro + pro_tol)
    ].copy()
    
    if valid.empty:
        return None
        
    valid['Error'] = abs(valid['Total Calories'] - target_cal) + (abs(valid['Total Protein'] - target_pro) * 10)
    return valid.sort_values('Error').head(5).drop(columns=['Error'])


# ==========================================
# UI LAYOUT & NAVIGATION
# ==========================================

st.title("MealFinder 🍽️")

# --- THE LOGIN WALL ---
if not st.session_state['current_user']:
    st.write("Welcome! Please log in or create a profile to continue.")
    
    col_login, col_register = st.columns(2)
    
    with col_login:
        st.subheader("Log In")
        if users_db:
            selected_user = st.selectbox("Select existing profile", ["-- Select Profile --"] + list(users_db.keys()))
            if selected_user != "-- Select Profile --":
                st.session_state['current_user'] = selected_user
                st.rerun()
        else:
            st.info("No profiles found. Create one to get started!")

    with col_register:
        st.subheader("Create New Profile")
        with st.form("register_form"):
            new_username = st.text_input("Username")
            sex = st.selectbox("Sex", ["Male", "Female"])
            age = st.number_input("Age", min_value=10, max_value=100, value=19)
            height = st.number_input("Height (cm)", min_value=100, max_value=250, value=181)
            weight = st.number_input("Weight (kg)", min_value=30.0, max_value=200.0, value=88.0)
            goal_weight = st.number_input("Goal Weight (kg)", min_value=30.0, max_value=200.0, value=80.0)
            activity = st.selectbox("Activity Level", ["Low", "Medium", "High"])
            
            if st.form_submit_button("Register"):
                if new_username in users_db:
                    st.error("Username already exists!")
                elif new_username:
                    if sex == "Male":
                        bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
                    else:
                        bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
                    
                    multipliers = {"Low": 1.2, "Medium": 1.55, "High": 1.725}
                    maintenance = bmr * multipliers[activity]
                    
                    target_cals = maintenance - 500 if goal_weight < weight else maintenance + 500 if goal_weight > weight else maintenance
                    target_pro = weight * 2 
                    
                    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                    
                    users_db[new_username] = {
                        "stats": {"sex": sex, "age": age, "height": height, "weight": weight, "activity": activity},
                        "goals": {"goal_weight": goal_weight},
                        "macros": {"target_cals": int(target_cals), "target_pro": int(target_pro)},
                        "history": {},
                        "weight_history": {now_str: weight},
                        "wishlist": [] 
                    }
                    save_users(users_db)
                    st.session_state['current_user'] = new_username
                    st.rerun()

    st.stop()


# --- SIDEBAR NAVIGATION ---
st.sidebar.header("Navigation")
page = st.sidebar.radio("Go to", ["Home / Tracker", "Search Cravings", "Plan Meals", "Groceries", "Update Profile"])

st.sidebar.markdown("---")
st.sidebar.write(f"👤 **Logged in as:** {st.session_state['current_user']}")
if st.sidebar.button("Log Out"):
    st.session_state['current_user'] = None
    st.session_state['combo_results'] = None
    st.session_state['search_results'] = None
    st.rerun()

# --- PAGE 1: HOME / TRACKER ---
if page == "Home / Tracker":
    user = st.session_state['current_user']
    profile = users_db[user]
    
    st.header(f"Welcome back, {user}! 👋")
    st.markdown("---")
    
    target_cals = profile['macros']['target_cals']
    target_pro = profile['macros']['target_pro']
    today = datetime.now().strftime("%Y-%m-%d") 
    
    if today not in profile['history']:
        profile['history'][today] = []
        save_users(users_db)
        
    todays_log = profile['history'][today]
    cals_eaten = sum(item['calories'] for item in todays_log)
    pro_eaten = sum(item['protein'] for item in todays_log)
    
    st.subheader("Today's Macros 📊")
    progress_val = min(cals_eaten / target_cals, 1.0)
    st.progress(progress_val)
    st.write(f"**{cals_eaten} / {target_cals} Calories** | **{pro_eaten} / {target_pro}g Protein**")
    
    st.markdown("---")
    st.subheader("Meals Logged Today")
    
    if not todays_log:
        st.write("No meals logged yet. Search for cravings or add custom food below!")
    else:
        for i, item in enumerate(todays_log):
            col_text, col_btn = st.columns([4, 1])
            with col_text:
                st.write(f"✅ **{item['name']}** ({item['calories']} kcal, {item['protein']}g protein)")
            with col_btn:
                if st.button("❌ Remove", key=f"delete_{i}"):
                    users_db[user]['history'][today].pop(i)
                    save_users(users_db)
                    st.rerun()
        
    with st.expander("➕ Add Custom Food (Manual Entry)"):
        with st.form("manual_entry"):
            food_name = st.text_input("Food Name")
            food_cal = st.number_input("Calories", min_value=0, step=10)
            food_pro = st.number_input("Protein (g)", min_value=0, step=1)
            if st.form_submit_button("Log Food"):
                users_db[user]['history'][today].append({
                    "name": food_name,
                    "calories": food_cal,
                    "protein": food_pro
                })
                save_users(users_db)
                st.success("Food logged!")
                st.rerun()

    st.markdown("---")

    st.subheader("Goal Progress 🎯")
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    if 'weight_history' not in profile:
        profile['weight_history'] = {now_str: profile['stats']['weight']}
        save_users(users_db)
        
    current_weight = profile['stats']['weight']
    goal_weight = profile['goals']['goal_weight']
    weight_diff = current_weight - goal_weight
    
    col_metric, col_update = st.columns([1, 2])
    with col_metric:
        st.metric(
            label="Current Weight", 
            value=f"{current_weight} kg", 
            delta=f"{weight_diff:.1f} kg to goal", 
            delta_color="inverse" if goal_weight < current_weight else "normal"
        )
        
    with col_update:
        with st.popover("⚖️ Log New Weight"):
            new_weight = st.number_input("Today's Weight (kg)", value=float(current_weight), step=0.1)
            if st.button("Update Weight"):
                users_db[user]['stats']['weight'] = new_weight
                update_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                users_db[user]['weight_history'][update_time] = new_weight
                save_users(users_db)
                st.rerun()

    if len(profile['weight_history']) > 0:
        st.write("**Weight Trend**")
        weight_data = pd.DataFrame(
            list(profile['weight_history'].items()), 
            columns=['Time', 'Weight']
        )
        weight_data['Time'] = pd.to_datetime(weight_data['Time'], format='mixed')
        weight_data.set_index('Time', inplace=True)
        st.line_chart(weight_data)


# --- PAGE 2: CRAVING SEARCH ---
elif page == "Search Cravings":
    st.write("Find exactly what you are craving, within your macros.")
    user = st.session_state['current_user']
    
    # We wrap the inputs in a form so typing doesn't instantly reload the page
    with st.form("search_form"):
        colA, colB = st.columns([3, 2])
        with colA:
            user_query = st.text_input("What are you craving?", placeholder="e.g., spicy asian noodles")
        with colB:
            available_tags = [
            'vegetarian', 'vegan', 'gluten-free', 'low-carb', 'high-protein', 'dairy-free',
            'spicy', 'sweet', 'savory', 'breakfast', 'lunch', 'dinner', 'snack', 'dessert',
            'chicken', 'beef', 'seafood', 'fish', 'egg', 'cheese', 'paneer', 'rice', 'noodles', 'pasta', 
            'pizza', 'burger', 'salad', 'soup', 'curry', 'sandwich', 'wrap', 'cake',
            'asian', 'indian', 'italian', 'mexican', 'chinese', 'american', 'mediterranean', 'thai', 'french']
            
            selected_tags = st.pills("Filter by tags", available_tags, selection_mode='multi')
            
        search_submit = st.form_submit_button("Search")

    if search_submit:
        # Convert tags to a tuple before passing so st.cache_data can hash it properly
        st.session_state['search_results'] = search_recipes(user_query, tuple(selected_tags if selected_tags else []))
        
    results = st.session_state.get('search_results')

    if results is not None:
        if results.empty:
            st.warning("No matches found.")
        else:
            st.write("💡 **Tip:** Click any column header to sort. Click the left edge of a row to reveal the recipe!")
            display_df = results[['name', 'calories', 'protein', 'minutes']]

            selection_event = st.dataframe(
                display_df,
                use_container_width=True,
                on_select="rerun",
                selection_mode="single-row"
            )

            if len(selection_event.selection.rows) > 0:
                clicked_row_index = selection_event.selection.rows[0]
                selected_recipe = results.iloc[clicked_row_index]
                
                st.markdown("---")
                st.subheader(f"📖 {selected_recipe['name'].title()}")
                
                if pd.notna(selected_recipe.get('description', '')) and selected_recipe.get('description', '') != '':
                    st.write(f"*{selected_recipe['description']}*")
                
                col_act1, col_act2 = st.columns(2)
                with col_act1:
                    if st.button("➕ Add to Today's Tracker"):
                        today = datetime.now().strftime("%Y-%m-%d")
                        if today not in users_db[user]['history']:
                            users_db[user]['history'][today] = []
                        users_db[user]['history'][today].append({
                            "name": selected_recipe['name'].title(),
                            "calories": int(selected_recipe['calories']),
                            "protein": int(selected_recipe['protein'])
                        })
                        save_users(users_db)
                        st.success(f"Added {selected_recipe['name'].title()} to your log!")

                with col_act2:
                    if st.button("❤️ Save to Groceries"):
                        recipe_exists = any(r['name'].lower() == selected_recipe['name'].lower() for r in users_db[user]['wishlist'])
                        if recipe_exists:
                            st.info("Recipe is already in your Groceries list!")
                        else:
                            users_db[user]['wishlist'].append({
                                "name": selected_recipe['name'].title(),
                                "calories": int(selected_recipe['calories']),
                                "protein": int(selected_recipe['protein']),
                                "minutes": int(selected_recipe['minutes']),
                                "ingredients": safe_parse_list(selected_recipe.get('ingredients', '[]')),
                                "steps": safe_parse_list(selected_recipe.get('steps', '[]'))
                            })
                            save_users(users_db)
                            st.success(f"Added {selected_recipe['name'].title()} to Groceries!")

                recipe_col1, recipe_col2 = st.columns([1,2])
                parsed_ings = safe_parse_list(selected_recipe.get('ingredients', '[]'))
                parsed_steps = safe_parse_list(selected_recipe.get('steps', '[]'))
                
                with recipe_col1:
                    st.write("**Ingredients:**")
                    for item in parsed_ings:
                        st.write(f"- {item}")
                        
                with recipe_col2:
                    st.write("**Instructions:**")
                    for i, step in enumerate(parsed_steps):
                        st.write(f"{i+1}. {step.capitalize()}")
                
                st.markdown("---")
                st.subheader("🤖 Similar Dishes You Might Like")
                
                original_df_index = selected_recipe.name 
                similar_results = get_similar_recipes(original_df_index)
                st.dataframe(similar_results, use_container_width=True)


# --- PAGE 3: PLAN MEALS ---
elif page == "Plan Meals":
    st.write("Generate a full day of eating based on your macro targets.")
    user = st.session_state['current_user']
    
    default_cals = 2000
    default_pro = 120
    if user:
        profile = users_db[user]
        default_cals = profile['macros']['target_cals']
        default_pro = profile['macros']['target_pro']

    with st.form("planner_form"):
        colA, colB, colC = st.columns(3)
        with colA:
            t_cal = st.number_input("Target Calories", min_value=500, max_value=5000, value=default_cals, step=50)
        with colB:
            t_pro = st.number_input("Target Protein (g)", min_value=10, max_value=300, value=default_pro, step=5)
        with colC:
            n_meals = st.number_input("Number of Meals", min_value=1, max_value=6, value=3)
            
        submit = st.form_submit_button("Generate Plan")
        
    if submit:
        st.session_state['combo_results'] = generate_dynamic_combo(t_cal, t_pro, n_meals)
        st.session_state['n_meals_memory'] = n_meals
        if st.session_state['combo_results'] is None:
            st.warning("No combinations found in that exact range. Try adjusting your targets.")
            
    combo_results = st.session_state.get('combo_results')
        
    if combo_results is not None:
        n_meals_mem = st.session_state['n_meals_memory']
        st.subheader(f"Optimal {n_meals_mem}-Meal Combos")
        
        st.write("💡 **Tip:** Click on a combo row to see the recipes inside it!")
        selection_event = st.dataframe(
            combo_results,
            use_container_width=True,
            on_select="rerun",
            selection_mode="single-row"
        )
        
        if len(selection_event.selection.rows) > 0:
            clicked_row_index = selection_event.selection.rows[0]
            selected_combo = combo_results.iloc[clicked_row_index]
            
            st.markdown("---")
            st.subheader("🍽️ Combo Details")
            
            col_log, col_grocery = st.columns(2)
            with col_log:
                if st.button("➕ Log Entire Combo to Tracker", key=f"track_combo_{clicked_row_index}"):
                    today = datetime.now().strftime("%Y-%m-%d")
                    if today not in users_db[user]['history']:
                        users_db[user]['history'][today] = []
                        
                    for col in selected_combo.index:
                        if col.startswith('Meal '):
                            meal_name = selected_combo[col]
                            recipe_data = df[df['name'] == meal_name].iloc[0]
                            users_db[user]['history'][today].append({
                                "name": meal_name.title(),
                                "calories": int(recipe_data['calories']),
                                "protein": int(recipe_data['protein'])
                            })
                    save_users(users_db)
                    st.success("Entire combo logged for today!")
            
            with col_grocery:
                if st.button("❤️ Save Entire Combo to Groceries", key=f"grocery_combo_{clicked_row_index}"):
                    added_count = 0
                    for col in selected_combo.index:
                        if col.startswith('Meal '):
                            meal_name = selected_combo[col]
                            if not any(r['name'].lower() == meal_name.lower() for r in users_db[user]['wishlist']):
                                recipe_data = df[df['name'] == meal_name].iloc[0]
                                users_db[user]['wishlist'].append({
                                    "name": meal_name.title(),
                                    "calories": int(recipe_data['calories']),
                                    "protein": int(recipe_data['protein']),
                                    "minutes": int(recipe_data['minutes']),
                                    "ingredients": safe_parse_list(recipe_data.get('ingredients', '[]')),
                                    "steps": safe_parse_list(recipe_data.get('steps', '[]'))
                                })
                                added_count += 1
                    save_users(users_db)
                    if added_count > 0:
                        st.success(f"Added {added_count} new meals to your Groceries list!")
                    else:
                        st.info("All meals from this combo are already in your Groceries list.")
            
            st.write("") 

            for col in selected_combo.index:
                if col.startswith('Meal '):
                    meal_name = selected_combo[col]
                    recipe_data = df[df['name'] == meal_name].iloc[0]
                    parsed_ings = safe_parse_list(recipe_data.get('ingredients', '[]'))
                    parsed_steps = safe_parse_list(recipe_data.get('steps', '[]'))
                    
                    with st.expander(f"**{meal_name.title()}** ({int(recipe_data['calories'])} kcal | {int(recipe_data['protein'])}g protein)"):
                        
                        ind_col1, ind_col2 = st.columns(2)
                        with ind_col1:
                            if st.button("➕ Add Only This to Tracker", key=f"track_ind_{clicked_row_index}_{col}"):
                                today = datetime.now().strftime("%Y-%m-%d")
                                if today not in users_db[user]['history']:
                                    users_db[user]['history'][today] = []
                                users_db[user]['history'][today].append({
                                    "name": meal_name.title(),
                                    "calories": int(recipe_data['calories']),
                                    "protein": int(recipe_data['protein'])
                                })
                                save_users(users_db)
                                st.success(f"Logged {meal_name.title()}!")
                                
                        with ind_col2:
                            if st.button("❤️ Save Only This to Groceries", key=f"groc_ind_{clicked_row_index}_{col}"):
                                if not any(r['name'].lower() == meal_name.lower() for r in users_db[user]['wishlist']):
                                    users_db[user]['wishlist'].append({
                                        "name": meal_name.title(),
                                        "calories": int(recipe_data['calories']),
                                        "protein": int(recipe_data['protein']),
                                        "minutes": int(recipe_data['minutes']),
                                        "ingredients": parsed_ings,
                                        "steps": parsed_steps
                                    })
                                    save_users(users_db)
                                    st.success(f"Added {meal_name.title()} to Groceries!")
                                else:
                                    st.info("Already in Groceries!")
                        
                        st.write(f"**Prep Time:** {recipe_data['minutes']} mins")
                        st.write(f"**Ingredients:** {', '.join(parsed_ings)}")
                        st.write("**Instructions:**")
                        for i, step in enumerate(parsed_steps):
                            st.write(f"{i+1}. {step.capitalize()}")


# --- PAGE 4: GROCERIES & WISHLIST ---
elif page == "Groceries":
    st.write("Manage your saved recipes and auto-generated shopping list.")
    user = st.session_state['current_user']
    profile = users_db[user]
    wishlist = profile.get('wishlist', [])
    
    if not wishlist:
        st.info("Your wishlist is empty. Go to Search Cravings or Plan Meals to add some recipes!")
    else:
        col_groceries, col_recipes = st.columns([1, 1])
        
        with col_recipes:
            st.subheader("Saved Recipes")
            for i, recipe in enumerate(wishlist):
                with st.expander(f"📖 {recipe['name']}"):
                    st.write(f"**Macros:** {recipe.get('calories', 0)} kcal | {recipe.get('protein', 0)}g protein")
                    
                    if st.button("❌ Remove Recipe", key=f"remove_wishlist_{i}"):
                        users_db[user]['wishlist'].pop(i)
                        save_users(users_db)
                        st.rerun()
                    
                    st.write("**Ingredients:**")
                    for ing in recipe.get('ingredients', []):
                        st.write(f"- {ing}")
                        
                    st.write("**Instructions:**")
                    for j, step in enumerate(recipe.get('steps', [])):
                        st.write(f"{j+1}. {step.capitalize()}")
        
        with col_groceries:
            st.subheader("🛒 Aggregated Grocery List")
            st.write("Items mapped to the exact recipes requiring them.")
            st.markdown("---")
            
            grocery_map = {}
            for recipe in wishlist:
                for ing in recipe.get('ingredients', []):
                    if isinstance(ing, str) and len(ing.strip()) > 1:
                        clean_ing = ing.strip().capitalize()
                        if clean_ing not in grocery_map:
                            grocery_map[clean_ing] = []
                        grocery_map[clean_ing].append(recipe['name'])
            
            for ing in sorted(grocery_map.keys()):
                needed_for = ", ".join(grocery_map[ing])
                st.markdown(f"- **{ing}** <br> <span style='font-size:0.85em; color:gray;'>Needed for: {needed_for}</span>", unsafe_allow_html=True)


# --- PAGE 5: UPDATE PROFILE ---
elif page == "Update Profile":
    st.write("Manage your body stats and goals.")
    st.markdown("---")
    
    user = st.session_state['current_user']
    profile = users_db[user]
    
    with st.form("update_profile_form"):
        col1, col2 = st.columns(2)
        with col1:
            sex_idx = 0 if profile['stats']['sex'] == "Male" else 1
            sex = st.selectbox("Sex", ["Male", "Female"], index=sex_idx)
            age = st.number_input("Age", min_value=10, max_value=100, value=int(profile['stats']['age']))
            height = st.number_input("Height (cm)", min_value=100, max_value=250, value=int(profile['stats']['height']))
        with col2:
            weight = st.number_input("Weight (kg)", min_value=30.0, max_value=200.0, value=float(profile['stats']['weight']))
            goal_weight = st.number_input("Goal Weight (kg)", min_value=30.0, max_value=200.0, value=float(profile['goals']['goal_weight']))
            
            act_options = ["Low", "Medium", "High"]
            act_idx = act_options.index(profile['stats']['activity']) if profile['stats']['activity'] in act_options else 1
            activity = st.selectbox("Activity Level", act_options, index=act_idx)
            
        submit_update = st.form_submit_button("Update Goals & Macros")
        
        if submit_update:
            if sex == "Male":
                bmr = (10 * weight) + (6.25 * height) - (5 * age) + 5
            else:
                bmr = (10 * weight) + (6.25 * height) - (5 * age) - 161
            
            multipliers = {"Low": 1.2, "Medium": 1.55, "High": 1.725}
            maintenance = bmr * multipliers[activity]
            
            if goal_weight < weight:
                target_cals = maintenance - 500
            elif goal_weight > weight:
                target_cals = maintenance + 500
            else:
                target_cals = maintenance
                
            target_pro = weight * 2 
            
            users_db[user]['stats'] = {"sex": sex, "age": age, "height": height, "weight": weight, "activity": activity}
            users_db[user]['goals'] = {"goal_weight": goal_weight}
            users_db[user]['macros'] = {"target_cals": int(target_cals), "target_pro": int(target_pro)}
            
            save_users(users_db)
            st.success(f"Profile updated! Your new daily target is {int(target_cals)} kcal and {int(target_pro)}g protein.")
            st.rerun()