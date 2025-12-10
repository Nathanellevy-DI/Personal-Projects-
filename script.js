// script.js (FIXED VERSION)
document.addEventListener('DOMContentLoaded', () => {
    const loginForm = document.getElementById('loginForm');
    const loginPage = document.getElementById('loginPage');
    const mapPage = document.getElementById('mapPage');
    const searchInput = document.getElementById('search');
    const searchButton = document.getElementById('searchButton');
    const suggestionsBox = document.getElementById('suggestions');
    const savedList = document.getElementById('savedList');
    const sidebarToggle = document.getElementById('sidebarToggle');
    const closeSidebar = document.getElementById('closeSidebar');
    const locationBtn = document.getElementById('locationBtn');
    
    // Topbar buttons
    const exportBtn = document.getElementById('exportBtn');
    const clearAllBtn = document.getElementById('clearAllBtn');
    
    // Sidebar buttons (if they exist)
    const exportBtnSidebar = document.getElementById('exportBtnSidebar');
    const clearAllBtnSidebar = document.getElementById('clearAllBtnSidebar');

    // Geoapify Key
    const GEOAPIFY_KEY = '8dce2a1641ca4c0bac83f3feafc51bbf'; 

    let map;
    let savedPlaces = loadSavedPlaces();
    const savedMarkers = {};
    let searchDebounceTimer;

    /* --- LOGIN AND PAGE VIEW MANAGEMENT --- */

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();
        if (username === 'test123' && password === 'password') {
            loginPage.classList.remove('active');
            mapPage.classList.add('active');
            setTimeout(initializeMap, 100); 
            renderSavedList();
        } else {
            alert('Invalid username or password. Please try again.');
        }
    });

    /* --- SIDEBAR AND ACTION BUTTONS --- */

    sidebarToggle.addEventListener('click', () => {
        document.getElementById('sidebar').classList.toggle('open');
    });
    
    closeSidebar.addEventListener('click', () => {
        document.getElementById('sidebar').classList.remove('open');
    });

    // Export functionality
    function handleExport() {
        const blob = new Blob([JSON.stringify(savedPlaces, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; 
        a.download = 'saved_places.json'; 
        a.click(); 
        URL.revokeObjectURL(url);
    }

    // Clear all functionality
    function handleClearAll() {
        if (confirm('Clear all saved places? This cannot be undone.')) {
            savedPlaces = []; 
            savePlaces(); 
            clearSavedMarkers(); 
            renderSavedList();
        }
    }

    // Wire up both sets of buttons
    if (exportBtn) exportBtn.addEventListener('click', handleExport);
    if (clearAllBtn) clearAllBtn.addEventListener('click', handleClearAll);
    if (exportBtnSidebar) exportBtnSidebar.addEventListener('click', handleExport);
    if (clearAllBtnSidebar) clearAllBtnSidebar.addEventListener('click', handleClearAll);

    // Location button - get user's current location
    if (locationBtn) {
        locationBtn.addEventListener('click', () => {
            if (!map) {
                alert('Please wait for the map to load.');
                return;
            }
            
            if ('geolocation' in navigator) {
                locationBtn.disabled = true;
                locationBtn.textContent = '⏳';
                
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const lat = position.coords.latitude;
                        const lon = position.coords.longitude;
                        map.setView([lat, lon], 15);
                        
                        // Add temporary marker at user location
                        const marker = L.marker([lat, lon]).addTo(map);
                        marker._isTemporary = true;
                        marker.bindPopup(`<strong>Your Location</strong><br>Lat: ${lat.toFixed(5)}, Lon: ${lon.toFixed(5)}`).openPopup();
                        
                        locationBtn.disabled = false;
                        locationBtn.textContent = '📍';
                    },
                    (error) => {
                        alert('Unable to get your location. Please check permissions.');
                        console.error('Geolocation error:', error);
                        locationBtn.disabled = false;
                        locationBtn.textContent = '📍';
                    }
                );
            } else {
                alert('Geolocation is not supported by your browser.');
            }
        });
    }

    /* --- MAP INITIALIZATION AND EVENT LISTENERS --- */

    function initializeMap() {
        if (map) return;
        
        map = L.map('map').setView([31.7683, 35.2137], 13);
        L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png', { 
            maxZoom: 19,
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        }).addTo(map);
        
        savedPlaces.forEach(p => addSavedMarker(p));

        // Debounced Autocomplete Listener
        searchInput.addEventListener('input', () => {
            clearTimeout(searchDebounceTimer);
            const q = searchInput.value.trim();
            
            if (!q) {
                hideSuggestions();
                return;
            }
            
            searchDebounceTimer = setTimeout(() => fetchAutocomplete(q), 300);
        });

        // Keydown Listener
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                hideSuggestions();
                searchInput.blur();
            }
            
            if (e.key === 'Enter') {
                e.preventDefault();
                const q = searchInput.value.trim();
                if (q) {
                    searchLocation(q);
                    hideSuggestions();
                }
            }
        });

        // Search button logic
        searchButton.addEventListener('click', (e) => {
            e.preventDefault();
            const q = searchInput.value.trim();
            if (q) {
                searchLocation(q);
                hideSuggestions();
            } else {
                searchInput.focus();
                searchInput.placeholder = 'Enter a location to search...';
                setTimeout(() => {
                    searchInput.placeholder = 'Search places...';
                }, 1500);
            }
        });

        // Map Click Listener
        map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            const m = L.marker([lat, lng]).addTo(map);
            m._isTemporary = true;
            
            m.bindPopup(`
                Pinned: ${lat.toFixed(5)}, ${lng.toFixed(5)}
                <br>
                <button class="primary" id="save-temp" style="margin-top:8px">
                    Save This Location
                </button>
            `).openPopup();
            
            setTimeout(() => {
                const btn = document.getElementById('save-temp');
                if (btn) btn.onclick = () => {
                    const name = prompt('Name this place:', 'My Clicked Location');
                    if (name) {
                        const place = { 
                            id: 'p_' + Date.now(), 
                            name, 
                            lat, 
                            lon: lng, 
                            formatted: `${name} (${lat.toFixed(4)}, ${lng.toFixed(4)})` 
                        };
                        
                        const isDuplicate = savedPlaces.some(sp => 
                            Math.abs(sp.lat - place.lat) < 0.0001 && 
                            Math.abs(sp.lon - place.lon) < 0.0001
                        );
                        
                        if (!isDuplicate) {
                            savedPlaces.unshift(place); 
                            savePlaces(); 
                            addSavedMarker(place); 
                            renderSavedList(); 
                            alert('Location saved!');
                            map.removeLayer(m);
                        } else {
                            alert('This location is already saved.');
                            m.closePopup();
                        }
                    }
                };
            }, 50);
        });
    }
    
    // Click-Outside Listener
    document.addEventListener('click', (e) => {
        if (!map) return;
        
        const isSearchClick = searchInput.contains(e.target) || 
                              suggestionsBox.contains(e.target) || 
                              searchButton.contains(e.target);
        
        if (!isSearchClick) {
            hideSuggestions();
        }
    });

    /* --- API & SEARCH LOGIC --- */

    async function fetchAutocomplete(q) {
        try {
            const url = `https://api.geoapify.com/v1/geocode/autocomplete?text=${encodeURIComponent(q)}&limit=5&format=json&apiKey=${GEOAPIFY_KEY}`;
            const res = await fetch(url); 
            if (!res.ok) throw new Error(`API Error: ${res.status}`);
            
            const data = await res.json();
            renderSuggestions(data.results || []);
        } catch (err) { 
            console.error('Autocomplete Error:', err); 
            hideSuggestions(); 
        }
    }

    function renderSuggestions(results) {
        suggestionsBox.innerHTML = '';
        if (!results || results.length === 0) { 
            hideSuggestions(); 
            return; 
        }
        
        results.forEach(r => {
            const div = document.createElement('div');
            div.className = 'result-item';
            
            const left = document.createElement('div'); 
            left.style.flex = '1';
            
            const title = document.createElement('div'); 
            title.className = 'result-title'; 
            title.textContent = r.name || r.formatted || 'Place';
            
            const sub = document.createElement('div'); 
            sub.className = 'result-sub'; 
            sub.textContent = r.formatted || '';
            
            left.appendChild(title); 
            left.appendChild(sub);

            const right = document.createElement('div'); 
            right.className = 'saved-actions'; 
            
            const viewBtn = document.createElement('button'); 
            viewBtn.className = 'small-btn'; 
            viewBtn.textContent = 'View';
            viewBtn.onclick = () => { 
                panAndTempMarker({ 
                    name: r.name || r.formatted, 
                    lat: r.lat, 
                    lon: r.lon, 
                    formatted: r.formatted 
                }); 
                hideSuggestions(); 
            };
            
            const saveBtn = document.createElement('button'); 
            saveBtn.className = 'small-btn'; 
            saveBtn.textContent = 'Save';
            saveBtn.onclick = () => { 
                const place = { 
                    id: 'p_'+Date.now(), 
                    name: r.name || r.formatted || 'Place', 
                    lat: r.lat, 
                    lon: r.lon, 
                    formatted: r.formatted || '' 
                }; 
                
                const isDuplicate = savedPlaces.some(sp => 
                    sp.formatted === place.formatted || 
                    (Math.abs(sp.lat - place.lat) < 0.0001 && Math.abs(sp.lon - place.lon) < 0.0001)
                );
                
                if (!isDuplicate) {
                    savedPlaces.unshift(place); 
                    savePlaces(); 
                    addSavedMarker(place); 
                    renderSavedList(); 
                    alert('Location saved!');
                } else {
                    alert('This location is already saved.');
                }
                hideSuggestions(); 
            };
            
            right.appendChild(viewBtn); 
            right.appendChild(saveBtn);

            div.appendChild(left); 
            div.appendChild(right);
            suggestionsBox.appendChild(div);
        });
        suggestionsBox.style.display = 'block';
    }

    function hideSuggestions() { 
        suggestionsBox.style.display = 'none'; 
        suggestionsBox.innerHTML = ''; 
    }
    
    function searchLocation(query) {
        if (!query) return; 
        
        clearTemporaryMarkers();

        const url = `https://api.geoapify.com/v1/geocode/search?text=${encodeURIComponent(query)}&format=json&limit=1&apiKey=${GEOAPIFY_KEY}`;
        
        fetch(url)
            .then(res => res.json())
            .then(data => {
                if (!data.results || data.results.length === 0) {
                    alert('Location not found.');
                    return;
                }
                
                const p = data.results[0];
                const lat = p.lat;
                const lon = p.lon;
                
                const marker = L.marker([lat, lon]).addTo(map);
                marker._isTemporary = true;
                
                const formattedName = p.formatted || p.name || query;
                marker.bindPopup(`
                    <strong>${formattedName}</strong><br>
                    <button class="primary" id="save-search-result" style="margin-top:8px">
                        Save This Location
                    </button>
                `).openPopup();
                
                map.setView([lat, lon], 14);
                
                setTimeout(() => {
                    const saveBtn = document.getElementById('save-search-result');
                    if (saveBtn) {
                        saveBtn.onclick = () => {
                            const place = {
                                id: 'p_' + Date.now(),
                                name: p.name || formattedName,
                                lat: lat,
                                lon: lon,
                                formatted: formattedName
                            };
                            
                            const isDuplicate = savedPlaces.some(sp => 
                                sp.formatted === place.formatted || 
                                (Math.abs(sp.lat - place.lat) < 0.0001 && Math.abs(sp.lon - place.lon) < 0.0001)
                            );
                            
                            if (!isDuplicate) {
                                savedPlaces.unshift(place);
                                savePlaces();
                                addSavedMarker(place);
                                renderSavedList();
                                alert('Location saved!');
                            } else {
                                alert('This location is already saved.');
                            }
                            
                            map.removeLayer(marker);
                        };
                    }
                }, 100);
            })
            .catch(err => {
                console.error('Search Error:', err);
                alert('Search failed. Please try again.');
            });
    }

    function panAndTempMarker(place) {
        if (!map) return;
        
        clearTemporaryMarkers();

        const m = L.marker([place.lat, place.lon]).addTo(map);
        m._isTemporary = true;
        
        m.bindPopup(`
            ${place.name || ''}<br>
            <button class="primary" id="save-suggest" style="margin-top:8px">
                Save This Location
            </button>
        `).openPopup();
        
        map.setView([place.lat, place.lon], 15);
        
        setTimeout(() => {
            const btn = document.getElementById('save-suggest');
            if (btn) {
                btn.onclick = () => {
                    const newPlace = { 
                        id: 'p_'+Date.now(), 
                        name: place.name, 
                        lat: place.lat, 
                        lon: place.lon, 
                        formatted: place.formatted || '' 
                    };
                    
                    const isDuplicate = savedPlaces.some(sp => 
                        sp.formatted === newPlace.formatted || 
                        (Math.abs(sp.lat - newPlace.lat) < 0.0001 && Math.abs(sp.lon - newPlace.lon) < 0.0001)
                    );

                    if (!isDuplicate) {
                        savedPlaces.unshift(newPlace);
                        savePlaces(); 
                        addSavedMarker(newPlace); 
                        renderSavedList(); 
                        alert('Location saved!');
                        map.removeLayer(m);
                    } else {
                        alert('This location is already saved.');
                        m.closePopup();
                    }
                };
            }
        }, 50);
        
        setTimeout(() => { 
            if (map && map.hasLayer(m)) {
                map.removeLayer(m); 
            }
        }, 7000); 
    }

    /* --- DATA MANAGEMENT --- */
    
    function loadSavedPlaces() { 
        try { 
            const raw = localStorage.getItem('travelmaps:saved'); 
            return raw ? JSON.parse(raw) : []; 
        } catch (e) { 
            console.error('Error loading saved places:', e);
            return []; 
        } 
    }
    
    function savePlaces() { 
        localStorage.setItem('travelmaps:saved', JSON.stringify(savedPlaces)); 
    }

    function renderSavedList() {
        savedList.innerHTML = '';
        
        if (!savedPlaces || savedPlaces.length === 0) { 
            const p = document.createElement('div'); 
            p.className = 'result-sub'; 
            p.textContent = 'No saved places yet.'; 
            savedList.appendChild(p); 
            return; 
        }
        
        savedPlaces.forEach(place => {
            const card = document.createElement('div'); 
            card.className = 'saved-card';
            
            const left = document.createElement('div'); 
            left.className = 'saved-left';
            
            const t = document.createElement('div'); 
            t.className = 'saved-title'; 
            t.textContent = place.name || place.formatted || 'Place';
            
            const s = document.createElement('div'); 
            s.className = 'saved-sub'; 
            s.textContent = place.formatted || `${place.lat.toFixed(4)}, ${place.lon.toFixed(4)}`;
            
            left.appendChild(t); 
            left.appendChild(s);
            
            const actions = document.createElement('div'); 
            actions.className = 'saved-actions';
            
            const goBtn = document.createElement('button'); 
            goBtn.className = 'small-btn'; 
            goBtn.textContent = 'Go'; 
            goBtn.onclick = () => { 
                map.setView([place.lat, place.lon], 15); 
                if (savedMarkers[place.id]) savedMarkers[place.id].openPopup(); 
            };
            
            const delBtn = document.createElement('button'); 
            delBtn.className = 'small-btn'; 
            delBtn.textContent = 'Delete'; 
            delBtn.onclick = () => { 
                if (!confirm('Delete this saved place?')) return; 
                savedPlaces = savedPlaces.filter(p => p.id !== place.id); 
                savePlaces(); 
                removeSavedMarker(place.id); 
                renderSavedList(); 
            };
            
            actions.appendChild(goBtn); 
            actions.appendChild(delBtn);
            
            card.appendChild(left); 
            card.appendChild(actions); 
            savedList.appendChild(card);
        });
    }

    /* --- MARKER MANAGEMENT --- */
    
    function addSavedMarker(place) {
        if (!map) return;
        if (savedMarkers[place.id]) return;
        
        const m = L.marker([place.lat, place.lon]).addTo(map);
        m._isTemporary = false;
        
        m.bindPopup(`<strong>${place.name}</strong><div class="result-sub">${place.formatted || ''}</div>`);
        savedMarkers[place.id] = m;
    }

    function removeSavedMarker(id) { 
        if (savedMarkers[id]) { 
            map.removeLayer(savedMarkers[id]); 
            delete savedMarkers[id]; 
        } 
    }
    
    function clearSavedMarkers() { 
        Object.keys(savedMarkers).forEach(id => { 
            map.removeLayer(savedMarkers[id]); 
            delete savedMarkers[id]; 
        }); 
    }
    
    function clearTemporaryMarkers() {
        if (!map) return;
        
        map.eachLayer(layer => {
            if (layer instanceof L.Marker && layer._isTemporary) {
                map.removeLayer(layer);
            }
        });
    }
});