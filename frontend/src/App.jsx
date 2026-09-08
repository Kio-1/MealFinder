import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Search, Calendar, ShoppingCart, User, LogOut, Activity, X, Moon, Sun, Plus, Heart, Trash2, ChevronRight, ChevronDown } from 'lucide-react';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend } from 'chart.js';
import { Line } from 'react-chartjs-2';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend);

const API_BASE_URL = "https://mealfinder-fi9a.onrender.com/api";
const RESULTS_PER_PAGE = 20;
const TAG_OPTIONS = ['high-protein', 'low-carb', 'vegetarian', 'vegan', 'chicken', 'beef', 'pork', 'dessert'];

// Helper to grab local timezone date regardless of Render's UTC server
const getLocalTodayStr = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export default function App() {
  const [currentUser, setCurrentUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState('tracker');
  const [isDark, setIsDark] = useState(true);
  
  const [showAuth, setShowAuth] = useState(false);
  const [authType, setAuthType] = useState('login');
  const [authForm, setAuthForm] = useState({ username: '', password: '', age: 19, sex: 'Male', weight: '', height: 181, goal_weight: '', activity: 'Moderate' });
  const [authError, setAuthError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const [manualFood, setManualFood] = useState({ name: '', calories: '', protein: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [searchTags, setSearchTags] = useState([]);
  const [searchResults, setSearchResults] = useState([]);
  const [searchPage, setSearchPage] = useState(1);
  const [planForm, setPlanForm] = useState({ calories: 2000, protein: 120, meals: 3 });
  const [planTags, setPlanTags] = useState([]);
  const [planResults, setPlanResults] = useState([]);
  const [currency, setCurrency] = useState('India');
  const [expandedRecipe, setExpandedRecipe] = useState(null);

  useEffect(() => {
    if (profile && profile.macros) {
      setPlanForm(prev => ({ 
        ...prev, 
        calories: profile?.macros?.target_cals || 2000, 
        protein: profile?.macros?.target_pro || 120 
      }));
    }
  }, [profile]);

  useEffect(() => {
    if (isDark) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDark]);

  const handleInputChange = (e) => setAuthForm({ ...authForm, [e.target.name]: e.target.value });
  const handleKeyDown = (e, action) => { if (e.key === 'Enter') action(); };

  // ==========================================
  // API CALLS: AUTH & PROFILE
  // ==========================================
  const login = async () => {
    if (!authForm.username || !authForm.password) return setAuthError("Fill all fields");
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: authForm.username, password: authForm.password })
      });
      const data = await res.json();
      if (res.ok) { setCurrentUser(authForm.username); setProfile(data.profile); setShowAuth(false); } 
      else setAuthError(data.error);
    } catch (err) { setAuthError("Server error."); }
    setIsLoading(false);
  };

  const register = async () => {
    if (!authForm.username || !authForm.password || !authForm.weight || !authForm.goal_weight) return setAuthError("Fill required fields");
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(authForm)
      });
      if (res.ok) { setAuthType('login'); setAuthError("Profile created! Please log in."); } 
      else { const data = await res.json(); setAuthError(data.error); }
    } catch (err) { setAuthError("Server error."); }
    setIsLoading(false);
  };

  const updateProfile = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const payload = { username: currentUser, ...Object.fromEntries(formData) };
    try {
      const res = await fetch(`${API_BASE_URL}/update-profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); alert("Profile Updated!"); }
    } catch (err) { alert("Error updating profile."); }
  };

  const deleteAccount = async () => {
    if (!window.confirm("Are you absolutely sure? This cannot be undone.")) return;
    try {
      const res = await fetch(`${API_BASE_URL}/delete-account`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser }) });
      if (res.ok) { setCurrentUser(null); setProfile(null); setActiveTab('tracker'); }
    } catch (err) { alert("Error deleting account."); }
  };

  const logout = () => { 
    setCurrentUser(null); 
    setProfile(null); 
    setActiveTab('tracker'); 
  };

  // ==========================================
  // API CALLS: TRACKER & GROCERIES (TIMEZONE SYNCED)
  // ==========================================
  const logFood = async (meal) => {
    try {
      const res = await fetch(`${API_BASE_URL}/log-food`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ username: currentUser, date: getLocalTodayStr(), ...meal })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); alert(`${meal.name} added!`); }
    } catch (err) { alert("Failed to log meal."); }
  };

  const removeFood = async (index) => {
    try {
      const res = await fetch(`${API_BASE_URL}/remove-food`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ username: currentUser, date: getLocalTodayStr(), index })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); }
    } catch (err) { alert("Failed to remove meal."); }
  };

  const logCombo = async (meals) => {
    try {
      const res = await fetch(`${API_BASE_URL}/log-combo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ username: currentUser, date: getLocalTodayStr(), meals })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); alert("Combo logged!"); }
    } catch (err) { alert("Failed to log combo."); }
  };

  const addToWishlist = async (recipe) => {
    try {
      const res = await fetch(`${API_BASE_URL}/wishlist/add`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser, recipe })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); alert(data.message); }
    } catch (err) { alert("Failed to save recipe."); }
  };

  const removeFromWishlist = async (index) => {
    try {
      const res = await fetch(`${API_BASE_URL}/wishlist/remove`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser, index })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); }
    } catch (err) { alert("Failed to remove recipe."); }
  };

  const addComboToWishlist = async (meals) => {
    try {
      const res = await fetch(`${API_BASE_URL}/wishlist/add-combo`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: currentUser, meals })
      });
      if (res.ok) { const data = await res.json(); setProfile(data.profile); alert(data.message); }
    } catch (err) { alert("Failed to save combo."); }
  };

  // ==========================================
  // API CALLS: SEARCH & PLAN
  // ==========================================
  const handleSearch = async () => {
    setIsLoading(true); setSearchPage(1);
    try {
      const res = await fetch(`${API_BASE_URL}/search`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: searchQuery, tags: searchTags })
      });
      const data = await res.json();
      if (res.ok) setSearchResults(data.results || []); else alert(data.error);
    } catch (err) { alert("Search failed."); }
    setIsLoading(false);
  };

  const handlePlan = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/plan`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...planForm, tags: planTags })
      });
      const data = await res.json();
      if (res.ok) setPlanResults(data.results || []); else alert(data.message || data.error);
    } catch (err) { alert("Planning failed."); }
    setIsLoading(false);
  };

  const toggleTag = (tag, type) => {
    const setTags = type === 'search' ? setSearchTags : setPlanTags;
    setTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  // ==========================================
  // RENDER HELPERS
  // ==========================================
  const toggleRecipeExpand = (id) => setExpandedRecipe(expandedRecipe === id ? null : id);
  
  const renderRecipeDetails = (recipe) => (
    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800 overflow-hidden">
      <p className="text-zinc-500 italic mb-4">{recipe.description}</p>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <h4 className="font-bold text-brand mb-2">Ingredients</h4>
          <ul className="list-disc pl-5 text-sm text-zinc-400 space-y-1">
            {(Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).map((ing, i) => <li key={i}>{ing}</li>)}
          </ul>
        </div>
        <div>
          <h4 className="font-bold text-brand mb-2">Instructions</h4>
          <ol className="list-decimal pl-5 text-sm text-zinc-400 space-y-1">
            {(Array.isArray(recipe?.steps) ? recipe.steps : []).map((step, i) => <li key={i}>{step}</li>)}
          </ol>
        </div>
      </div>
    </motion.div>
  );

  const localTodayStr = getLocalTodayStr();
  const todayLog = Array.isArray(profile?.history?.[localTodayStr]) ? profile.history[localTodayStr] : [];
  const calsEaten = todayLog.reduce((sum, item) => sum + Number(item?.calories || 0), 0);
  const proEaten = todayLog.reduce((sum, item) => sum + Number(item?.protein || 0), 0);
  
  const currentWeight = profile?.stats?.weight || 80;
  const currentHeight = profile?.stats?.height || 181;
  const currentBmi = (currentWeight / Math.pow(currentHeight / 100, 2)).toFixed(1);

  const wishlist = Array.isArray(profile?.wishlist) ? profile.wishlist : [];
  let groceryMap = {};
  let globalIngredientCount = 0;
  wishlist.forEach(recipe => {
    (Array.isArray(recipe?.ingredients) ? recipe.ingredients : []).forEach(ingredient => {
      if(typeof ingredient !== 'string') return;
      let ingClean = ingredient.trim().charAt(0).toUpperCase() + ingredient.trim().slice(1);
      if(ingClean.length < 2) return;
      if (!groceryMap[ingClean]) groceryMap[ingClean] = [];
      groceryMap[ingClean].push(recipe.name);
    });
  });
  const sortedIngredients = Object.keys(groceryMap).sort();
  globalIngredientCount = sortedIngredients.length;
  
  const multipliers = { 'India': {rate: 45, sym: '₹'}, 'USA': {rate: 2.50, sym: '$'}, 'UK': {rate: 1.50, sym: '£'}, 'Europe': {rate: 2.00, sym: '€'} };
  const priceEst = `${multipliers[currency].sym}${(globalIngredientCount * multipliers[currency].rate).toFixed(2)}`;

  // ==========================================
  // LANDING PAGE
  // ==========================================
  if (!currentUser) {
    return (
      <div className="min-h-screen bg-[#080808] text-white transition-colors duration-300">
        <nav className="flex justify-between items-center p-6 max-w-6xl mx-auto">
          <h1 className="text-3xl font-extrabold text-brand flex items-center gap-2 tracking-tighter">MealFinder <Activity size={28} /></h1>
          <div className="flex gap-4">
            <button onClick={() => { setAuthType('login'); setShowAuth(true); }} className="text-zinc-400 font-medium hover:text-brand transition-colors">Log In</button>
            <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { setAuthType('register'); setShowAuth(true); }} className="bg-brand text-black px-5 py-2 rounded-full font-bold shadow-[0_0_15px_rgba(0,255,136,0.3)]">Sign Up</motion.button>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto text-center mt-20 px-6">
          <motion.h1 initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-6xl md:text-8xl font-extrabold tracking-tighter mb-6">Your intelligent <br/><span className="text-brand">meal planner.</span></motion.h1>
          <motion.p initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="text-xl text-zinc-400 mb-10 max-w-2xl mx-auto">Generate precise combinatorial meal plans tailored to your macros, search 195,000+ recipes instantly, and seamlessly compile your grocery lists.</motion.p>
          <motion.button initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => { setAuthType('register'); setShowAuth(true); }} className="bg-brand text-black px-8 py-4 rounded-full text-xl font-bold shadow-[0_0_20px_rgba(0,255,136,0.4)]">Get Started</motion.button>
        </main>

        <AnimatePresence>
          {showAuth && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4">
              <motion.div initial={{ scale: 0.95, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.95, opacity: 0 }} className="bg-[#121212] p-8 rounded-2xl w-full max-w-md shadow-2xl relative border border-zinc-800">
                <button onClick={() => setShowAuth(false)} className="absolute top-4 right-4 text-zinc-500 hover:text-red-500 transition-colors"><X size={24} /></button>
                <h2 className="text-3xl font-bold mb-6 tracking-tight text-white">{authType === 'login' ? 'Welcome Back' : 'Create Profile'}</h2>
                <div className="space-y-4">
                  <input name="username" placeholder="Username" onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, authType === 'login' ? login : register)} className="w-full p-3 bg-[#1e1e1e] text-white border border-zinc-800 rounded-lg outline-none focus:border-brand" />
                  <input name="password" type="password" placeholder="Password" onChange={handleInputChange} onKeyDown={(e) => handleKeyDown(e, authType === 'login' ? login : register)} className="w-full p-3 bg-[#1e1e1e] text-white border border-zinc-800 rounded-lg outline-none focus:border-brand" />
                  {authType === 'register' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="space-y-4 overflow-hidden">
                      <div className="flex gap-4">
                        <input name="weight" type="number" placeholder="Weight (kg)" onChange={handleInputChange} className="w-full p-3 bg-[#1e1e1e] text-white border border-zinc-800 rounded-lg outline-none focus:border-brand" />
                        <input name="goal_weight" type="number" placeholder="Goal (kg)" onChange={handleInputChange} className="w-full p-3 bg-[#1e1e1e] text-white border border-zinc-800 rounded-lg outline-none focus:border-brand" />
                      </div>
                    </motion.div>
                  )}
                  {authError && <p className="text-red-500 text-sm text-center font-medium">{authError}</p>}
                  <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={authType === 'login' ? login : register} disabled={isLoading} className="w-full bg-brand text-black font-bold py-3 rounded-lg mt-2 disabled:opacity-50">
                    {isLoading ? 'Processing...' : (authType === 'login' ? 'Secure Login' : 'Create Profile')}
                  </motion.button>
                  <p className="text-center text-sm text-zinc-500 mt-4">
                    {authType === 'login' ? "New here? " : "Already have an account? "}
                    <span onClick={() => setAuthType(authType === 'login' ? 'register' : 'login')} className="text-brand cursor-pointer font-bold hover:underline">{authType === 'login' ? "Create an account" : "Log in"}</span>
                  </p>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  // ==========================================
  // DASHBOARD
  // ==========================================
  const tabs = [
    { id: 'tracker', icon: <Activity size={20} />, label: 'Tracker' },
    { id: 'search', icon: <Search size={20} />, label: 'Search' },
    { id: 'plan', icon: <Calendar size={20} />, label: 'Plan Meals' },
    { id: 'wishlist', icon: <ShoppingCart size={20} />, label: 'Groceries' },
    { id: 'profile', icon: <User size={20} />, label: 'Profile' },
    { id: 'settings', icon: <Settings size={20} />, label: 'Settings' },
  ];

  const renderTagButtons = (activeTags, context) => (
    <div className="flex flex-wrap gap-2 mb-6">
      {TAG_OPTIONS.map(tag => (
        <button key={tag} onClick={() => toggleTag(tag, context)} className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${activeTags.includes(tag) ? 'bg-brand text-black border-brand shadow-[0_0_10px_rgba(0,255,136,0.3)]' : 'bg-[#1e1e1e] text-zinc-400 border-zinc-800 hover:border-zinc-500'}`}>{tag}</button>
      ))}
    </div>
  );

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#080808] transition-colors duration-300 pb-20 md:pb-0 md:flex font-sans">
      <nav className="fixed bottom-0 w-full bg-white dark:bg-[#121212] border-t border-zinc-200 dark:border-zinc-800 md:relative md:w-64 md:border-t-0 md:border-r md:min-h-screen z-50">
        <div className="hidden md:flex p-6 items-center gap-2 text-2xl font-bold text-brand tracking-tighter">MealFinder <Activity size={24} /></div>
        <div className="flex md:flex-col justify-around md:justify-start p-2 md:p-4 gap-2">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`flex items-center gap-3 p-3 rounded-xl transition-all font-semibold ${activeTab === tab.id ? 'bg-brand text-black shadow-lg shadow-brand/20' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-[#1e1e1e] dark:hover:text-white'}`}>
              {tab.icon} <span className="hidden md:block">{tab.label}</span>
            </button>
          ))}
          <div className="hidden md:block mt-auto pt-4">
             <button onClick={logout} className="flex items-center gap-3 p-3 w-full rounded-xl text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 font-bold transition-colors"><LogOut size={20} /> Log Out</button>
          </div>
        </div>
      </nav>

      <main className="flex-1 max-w-5xl mx-auto p-6 md:p-10 overflow-y-auto">
        <AnimatePresence mode="wait">
          
          {/* TRACKER */}
          {activeTab === 'tracker' && (
            <motion.div key="tracker" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-8">
              <div>
                <h2 className="text-4xl font-extrabold tracking-tight mb-2">Welcome back, <span className="text-brand">{currentUser}</span></h2>
                <p className="text-zinc-500 font-medium">Here is your macro progress for today.</p>
              </div>

              <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                 <div className="mb-6">
                    <div className="flex justify-between mb-2"><span className="font-bold">Calories</span> <span className="text-zinc-500 font-bold">{calsEaten} / {profile?.macros?.target_cals || 0}</span></div>
                    <div className="h-4 bg-zinc-100 dark:bg-[#1e1e1e] rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full shadow-[0_0_10px_#00ff88] transition-all duration-500" style={{width: `${Math.min((calsEaten/(profile?.macros?.target_cals || 2000))*100, 100)}%`}}></div></div>
                 </div>
                 <div>
                    <div className="flex justify-between mb-2"><span className="font-bold">Protein</span> <span className="text-zinc-500 font-bold">{proEaten} / {profile?.macros?.target_pro || 0}g</span></div>
                    <div className="h-4 bg-zinc-100 dark:bg-[#1e1e1e] rounded-full overflow-hidden"><div className="h-full bg-brand rounded-full shadow-[0_0_10px_#00ff88] transition-all duration-500" style={{width: `${Math.min((proEaten/(profile?.macros?.target_pro || 120))*100, 100)}%`}}></div></div>
                 </div>
              </div>

              <div className="flex flex-col md:flex-row gap-4 bg-white dark:bg-[#121212] p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                <input type="text" placeholder="Food Name" value={manualFood.name} onChange={e => setManualFood({...manualFood, name: e.target.value})} onKeyDown={(e) => handleKeyDown(e, () => { logFood(manualFood); setManualFood({name:'', calories:'', protein:''}); })} className="flex-1 p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand" />
                <input type="number" placeholder="Calories" value={manualFood.calories} onChange={e => setManualFood({...manualFood, calories: e.target.value})} onKeyDown={(e) => handleKeyDown(e, () => { logFood(manualFood); setManualFood({name:'', calories:'', protein:''}); })} className="w-full md:w-32 p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand" />
                <input type="number" placeholder="Protein" value={manualFood.protein} onChange={e => setManualFood({...manualFood, protein: e.target.value})} onKeyDown={(e) => handleKeyDown(e, () => { logFood(manualFood); setManualFood({name:'', calories:'', protein:''}); })} className="w-full md:w-32 p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand" />
                <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={() => { logFood(manualFood); setManualFood({name:'', calories:'', protein:''}); }} className="bg-brand text-black font-bold p-3 rounded-xl"><Plus size={24} /></motion.button>
              </div>

              <div className="space-y-3">
                <h3 className="text-xl font-bold">Meals Eaten Today</h3>
                {todayLog.length === 0 ? <p className="text-zinc-500 italic">No meals logged yet.</p> : 
                  todayLog.map((meal, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-[#121212] p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                      <div>
                        <p className="font-bold text-lg">{meal.name}</p>
                        <p className="text-zinc-500 text-sm">{meal.calories} kcal | {meal.protein}g Protein</p>
                      </div>
                      <button onClick={() => removeFood(idx)} className="text-zinc-400 hover:text-red-500 transition-colors"><Trash2 size={20} /></button>
                    </div>
                  ))
                }
              </div>
            </motion.div>
          )}

          {/* SEARCH */}
          {activeTab === 'search' && (
            <motion.div key="search" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-4xl font-extrabold tracking-tight">Search Cravings</h2>
              <div className="flex gap-4">
                <input type="text" placeholder="e.g., spicy asian noodles..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} onKeyDown={(e) => handleKeyDown(e, handleSearch)} className="flex-1 p-4 bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-2xl outline-none focus:border-brand text-lg shadow-sm" />
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={handleSearch} disabled={isLoading} className="bg-brand text-black font-bold px-8 rounded-2xl shadow-[0_0_15px_rgba(0,255,136,0.3)]">{isLoading ? '...' : 'Search'}</motion.button>
              </div>
              {renderTagButtons(searchTags, 'search')}

              <div className="grid gap-6">
                {searchResults.slice((searchPage-1)*RESULTS_PER_PAGE, searchPage*RESULTS_PER_PAGE).map((recipe, idx) => {
                  const globalIdx = (searchPage-1)*RESULTS_PER_PAGE + idx;
                  const isExpanded = expandedRecipe === `search-${globalIdx}`;
                  return (
                    <div key={globalIdx} className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm">
                      <h3 className="text-2xl font-bold text-brand mb-2">{recipe.name}</h3>
                      <p className="text-zinc-700 dark:text-zinc-300 font-medium mb-4">{recipe.calories} kcal | {recipe.protein}g Protein | {recipe.minutes} mins</p>
                      
                      <button onClick={() => toggleRecipeExpand(`search-${globalIdx}`)} className="flex items-center gap-2 text-zinc-500 hover:text-brand font-semibold mb-4 transition-colors">
                        {isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>} View Recipe Details
                      </button>
                      {isExpanded && renderRecipeDetails(recipe)}

                      <div className="flex gap-4 mt-6">
                        <button onClick={() => logFood({name: recipe.name, calories: recipe.calories, protein: recipe.protein})} className="flex-1 bg-zinc-100 dark:bg-[#1e1e1e] hover:bg-brand hover:text-black text-zinc-900 dark:text-white font-bold py-3 rounded-xl transition-colors">Log to Tracker</button>
                        <button onClick={() => addToWishlist(recipe)} className="flex-1 border-2 border-zinc-200 dark:border-zinc-800 hover:border-brand hover:text-brand font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><Heart size={20} /> Groceries</button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {searchResults.length > RESULTS_PER_PAGE && (
                <div className="flex justify-center items-center gap-6 mt-8">
                  <button onClick={() => setSearchPage(p => Math.max(1, p-1))} disabled={searchPage === 1} className="p-2 disabled:opacity-50 text-brand"><ChevronRight size={24} className="rotate-180" /></button>
                  <span className="font-bold text-zinc-500">Page {searchPage} of {Math.ceil(searchResults.length/RESULTS_PER_PAGE)}</span>
                  <button onClick={() => setSearchPage(p => Math.min(Math.ceil(searchResults.length/RESULTS_PER_PAGE), p+1))} disabled={searchPage === Math.ceil(searchResults.length/RESULTS_PER_PAGE)} className="p-2 disabled:opacity-50 text-brand"><ChevronRight size={24} /></button>
                </div>
              )}
            </motion.div>
          )}

          {/* PLANNER */}
          {activeTab === 'plan' && (
            <motion.div key="plan" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-4xl font-extrabold tracking-tight">Auto-Planner</h2>
              
              <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col md:flex-row gap-4 shadow-sm">
                <div className="flex-1">
                  <label className="block text-sm font-bold text-zinc-500 mb-2">Target Calories</label>
                  <input type="number" value={planForm.calories} onChange={e => setPlanForm({...planForm, calories: e.target.value})} onKeyDown={(e) => handleKeyDown(e, handlePlan)} className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-zinc-500 mb-2">Target Protein (g)</label>
                  <input type="number" value={planForm.protein} onChange={e => setPlanForm({...planForm, protein: e.target.value})} onKeyDown={(e) => handleKeyDown(e, handlePlan)} className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                </div>
                <div className="flex-1">
                  <label className="block text-sm font-bold text-zinc-500 mb-2">Meals</label>
                  <input type="number" value={planForm.meals} onChange={e => setPlanForm({...planForm, meals: e.target.value})} onKeyDown={(e) => handleKeyDown(e, handlePlan)} className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                </div>
                <div className="flex items-end">
                  <motion.button whileHover={{scale: 1.05}} whileTap={{scale: 0.95}} onClick={handlePlan} disabled={isLoading} className="w-full md:w-auto bg-brand text-black font-bold px-8 py-3 rounded-xl shadow-[0_0_15px_rgba(0,255,136,0.3)] h-[52px]">
                    {isLoading ? 'Simulating...' : 'Generate'}
                  </motion.button>
                </div>
              </div>

              {renderTagButtons(planTags, 'plan')}

              <div className="grid gap-6">
                {planResults.map((combo, comboIdx) => (
                  <div key={comboIdx} className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm border-l-4 border-l-brand">
                    <h3 className="text-2xl font-bold mb-1">Option {comboIdx + 1}</h3>
                    <p className="text-brand font-bold mb-6">{combo['Total Calories']} kcal | {combo['Total Protein']}g Protein</p>
                    
                    <div className="space-y-4 mb-6">
                      {combo.meals.map((meal, mIdx) => {
                        const isExpanded = expandedRecipe === `plan-${comboIdx}-${mIdx}`;
                        return (
                          <div key={mIdx} className="bg-zinc-50 dark:bg-[#1a1a1a] p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                            <button onClick={() => toggleRecipeExpand(`plan-${comboIdx}-${mIdx}`)} className="w-full flex justify-between items-center font-bold text-lg hover:text-brand transition-colors text-left">
                              <span>Meal {mIdx + 1}: {meal.name}</span>
                              {isExpanded ? <ChevronDown size={20}/> : <ChevronRight size={20}/>}
                            </button>
                            {isExpanded && (
                              <div className="mt-4">
                                {renderRecipeDetails(meal)}
                                <div className="flex gap-4 mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-700">
                                  <button onClick={() => logFood({name: meal.name, calories: meal.calories, protein: meal.protein})} className="text-sm font-bold text-zinc-500 hover:text-white">Log Meal</button>
                                  <button onClick={() => addComboToWishlist([meal])} className="text-sm font-bold text-brand hover:text-white flex items-center gap-1"><Heart size={14}/> Save</button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <div className="flex flex-col md:flex-row gap-4">
                      <button onClick={() => logCombo(combo.meals)} className="flex-1 bg-zinc-100 dark:bg-[#1e1e1e] hover:bg-brand hover:text-black text-zinc-900 dark:text-white font-bold py-3 rounded-xl transition-colors">Log Entire Combo</button>
                      <button onClick={() => addComboToWishlist(combo.meals)} className="flex-1 border-2 border-zinc-200 dark:border-zinc-800 hover:border-brand hover:text-brand font-bold py-3 rounded-xl transition-colors flex justify-center items-center gap-2"><Heart size={20} /> Save All to Groceries</button>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* GROCERIES */}
          {activeTab === 'wishlist' && (
            <motion.div key="wishlist" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <h2 className="text-4xl font-extrabold tracking-tight">Groceries 🛒</h2>
                <select value={currency} onChange={e => setCurrency(e.target.value)} className="p-3 bg-white dark:bg-[#121212] border border-zinc-200 dark:border-zinc-800 rounded-xl outline-none font-bold shadow-sm">
                  <option value="India">India (₹)</option><option value="USA">USA ($)</option>
                  <option value="UK">UK (£)</option><option value="Europe">Europe (€)</option>
                </select>
              </div>

              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-2xl font-bold flex justify-between items-center mb-4">Master List <span className="text-brand bg-brand/10 px-3 py-1 rounded-lg">{priceEst}</span></h3>
                  {globalIngredientCount === 0 ? <p className="text-zinc-500 italic">No ingredients needed yet.</p> : (
                    <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 max-h-[70vh] overflow-y-auto">
                      {sortedIngredients.map(ing => (
                        <div key={ing} className="pb-4 border-b border-zinc-100 dark:border-zinc-800 last:border-0 last:pb-0">
                          <p className="font-bold text-lg text-zinc-900 dark:text-white">{ing}</p>
                          <p className="text-sm text-brand font-medium">Needed for: {groceryMap[ing].join(', ')}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h3 className="text-2xl font-bold mb-4">Saved Recipes</h3>
                  {wishlist.length === 0 ? <p className="text-zinc-500 italic">No recipes saved yet.</p> : (
                    <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                      {wishlist.map((recipe, idx) => (
                        <div key={idx} className="bg-white dark:bg-[#121212] p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm border-l-4 border-l-brand flex justify-between items-start">
                          <div>
                            <h4 className="font-bold text-lg mb-1">{recipe.name}</h4>
                            <p className="text-sm text-zinc-500 mb-2">{recipe.calories} kcal</p>
                            <button onClick={() => toggleRecipeExpand(`wish-${idx}`)} className="text-sm font-bold text-brand hover:underline">View Recipe</button>
                            {expandedRecipe === `wish-${idx}` && renderRecipeDetails(recipe)}
                          </div>
                          <button onClick={() => removeFromWishlist(idx)} className="text-zinc-400 hover:text-red-500 p-2"><Trash2 size={20}/></button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* PROFILE */}
          {activeTab === 'profile' && (
            <motion.div key="profile" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-4xl font-extrabold tracking-tight">Profile & Progress</h2>
              
              <div className="grid md:grid-cols-2 gap-6">
                <form onSubmit={updateProfile} className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
                  <h3 className="text-xl font-bold mb-4">Update Stats</h3>
                  <div className="flex gap-4">
                    <input name="age" type="number" defaultValue={profile?.stats?.age || 19} placeholder="Age" className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                    <select name="sex" defaultValue={profile?.stats?.sex || 'Male'} className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold">
                      <option value="Male">Male</option><option value="Female">Female</option>
                    </select>
                  </div>
                  <div className="flex gap-4">
                    <input name="weight" type="number" defaultValue={currentWeight} placeholder="Weight (kg)" className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                    <input name="height" type="number" defaultValue={currentHeight} placeholder="Height (cm)" className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                  </div>
                  <div className="flex gap-4">
                    <input name="goal_weight" type="number" defaultValue={profile?.goals?.goal_weight || 80} placeholder="Goal Weight (kg)" className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold" />
                    <select name="activity" defaultValue={profile?.stats?.activity || 'Moderate'} className="w-full p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl outline-none focus:ring-2 focus:ring-brand font-bold">
                      <option value="Sedentary">Sedentary</option><option value="Light">Lightly Active</option>
                      <option value="Moderate">Moderately Active</option><option value="Active">Very Active</option>
                    </select>
                  </div>
                  <motion.button whileHover={{scale: 1.02}} whileTap={{scale: 0.98}} type="submit" className="w-full bg-brand text-black font-bold py-3 rounded-xl mt-4">Recalculate Macros & Save</motion.button>
                </form>

                <div className="space-y-6">
                  <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex justify-around items-center">
                    <div className="text-center">
                      <p className="text-zinc-500 font-bold mb-1">Current BMI</p>
                      <p className="text-3xl font-extrabold text-brand">{currentBmi}</p>
                    </div>
                  </div>
                  
                  <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm h-64">
                    <h3 className="font-bold mb-4">Weight History</h3>
                    <Line 
                      data={{
                        labels: Object.keys(profile?.weight_history || {}).map(d => d.split(' ')[0]),
                        datasets: [{ label: 'Weight (kg)', data: Object.values(profile?.weight_history || {}), borderColor: '#00ff88', backgroundColor: 'rgba(0, 255, 136, 0.1)', borderWidth: 3, tension: 0.4, fill: true }]
                      }} 
                      options={{ responsive: true, maintainAspectRatio: false, scales: { y: { grid: { color: isDark ? '#222' : '#eee' } }, x: { grid: { color: isDark ? '#222' : '#eee' } } }, plugins: { legend: { display: false } } }}
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* SETTINGS */}
          {activeTab === 'settings' && (
            <motion.div key="settings" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="space-y-6">
              <h2 className="text-4xl font-extrabold tracking-tight">Settings</h2>
              <div className="bg-white dark:bg-[#121212] p-6 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex justify-between items-center shadow-sm">
                 <div>
                    <h3 className="font-bold text-lg">Appearance</h3>
                    <p className="text-zinc-500 text-sm font-medium">Toggle between Light and Dark themes.</p>
                 </div>
                 <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setIsDark(!isDark)} className="p-3 bg-zinc-100 dark:bg-[#1e1e1e] rounded-xl text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-800">
                    {isDark ? <Sun size={24} /> : <Moon size={24} />}
                 </motion.button>
              </div>
              <div className="bg-red-50 dark:bg-red-500/10 p-6 rounded-2xl border border-red-200 dark:border-red-500/20 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-sm">
                 <div>
                    <h3 className="font-bold text-lg text-red-600 dark:text-red-400">Danger Zone</h3>
                    <p className="text-red-500/80 text-sm font-medium">Permanently delete your account and all data. Cannot be undone.</p>
                 </div>
                 <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={deleteAccount} className="px-6 py-3 bg-red-500 text-white font-bold rounded-xl shadow-[0_0_15px_rgba(239,68,68,0.3)] w-full md:w-auto">
                    Delete Account
                 </motion.button>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}