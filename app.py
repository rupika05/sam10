import os
import sqlite3
import random
from flask import Flask, render_template, request, redirect, url_for, session, flash, jsonify
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'bloombox_memories_secret_key_cozy'
app.config['UPLOAD_FOLDER'] = os.path.join(app.root_path, 'static', 'uploads')
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024 # 50MB upload limit

# SQLite helper
def get_db_connection():
    db_path = os.path.join(app.root_path, 'database.db')
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    return conn

# Normalizer: maps DB column names to template-friendly names
# DB uses: filename, cover_image
# Templates/JS use: filepath, coverpath
def normalize_song(row):
    d = dict(row)
    d['filepath'] = d.get('filename', '')
    d['coverpath'] = d.get('cover_image', '')
    return d

# Pre-populated Playlists seeder
def seed_user_playlists(user_id):
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch seed songs
    cursor.execute("SELECT id, title FROM Songs")
    songs = {row['title']: row['id'] for row in cursor.fetchall()}
    
    default_playlists = [
        ("Midnight Hostel", "Midnight Memories"),
        ("Canteen Vibes", "Masala Vadai"),
        ("Sports Arena", "We Are The Fire"),
        ("Lecture Break", "Between Lecture"),
        ("Cultural Nights", "Own The Stage Tonight"),
        ("Bunk Diaries", "Won Gold")
    ]
    
    for p_name, s_title in default_playlists:
        cursor.execute("INSERT INTO Playlists (name, user_id) VALUES (?, ?)", (p_name, user_id))
        playlist_id = cursor.lastrowid
        
        song_id = songs.get(s_title)
        if song_id:
            cursor.execute("INSERT INTO PlaylistSongs (playlist_id, song_id) VALUES (?, ?)", (playlist_id, song_id))
            
    conn.commit()
    conn.close()

# Database Initializer
def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Users
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            is_admin INTEGER DEFAULT 0
        )
    ''')
    
    # Songs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Songs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            filename TEXT NOT NULL,
            cover_image TEXT NOT NULL,
            description TEXT
        )
    ''')
    
    # Playlists
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS Playlists (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            user_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE
        )
    ''')
    
    # PlaylistSongs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS PlaylistSongs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            playlist_id INTEGER,
            song_id INTEGER,
            FOREIGN KEY (playlist_id) REFERENCES Playlists (id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES Songs (id) ON DELETE CASCADE
        )
    ''')
    
    # LikedSongs
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS LikedSongs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            song_id INTEGER,
            FOREIGN KEY (user_id) REFERENCES Users (id) ON DELETE CASCADE,
            FOREIGN KEY (song_id) REFERENCES Songs (id) ON DELETE CASCADE
        )
    ''')
    
    # Seed default college memories songs if library is empty
    cursor.execute("SELECT COUNT(*) FROM Songs")
    if cursor.fetchone()[0] == 0:
        default_songs = [
            ("Midnight Memories", "caffeine_dream.mp3", "hostel.png", "Late-night hostel study sessions, friendships, laughter, midnight tea and unforgettable memories."),
            ("Masala Vadai", "masala_vadai_rush.mp3", "canteen.png", "The joy of canteen breaks, snacks, gossip and delicious campus food."),
            ("We Are The Fire", "we_are_the_fire.mp3", "sports.png", "Sports day energy, teamwork, victory and unforgettable moments on the ground."),
            ("Between Lecture", "ten_feet_tall.mp3", "lecture.png", "Sleeping between lectures, passing notes, funny moments and classroom memories."),
            ("Own The Stage Tonight", "own_the_stage_tonight.mp3", "cultural.png", "Cultural events, performances, dance, music and unforgettable stage moments."),
            ("Won Gold", "running_on_gold.mp3", "bunk.png", "Class bunk adventures, freedom, friendship and memorable college chaos.")
        ]
        cursor.executemany("INSERT INTO Songs (title, filename, cover_image, description) VALUES (?, ?, ?, ?)", default_songs)
        conn.commit()
        
    # Seed default admin if admin doesn't exist
    cursor.execute("SELECT COUNT(*) FROM Users WHERE username = 'admin'")
    if cursor.fetchone()[0] == 0:
        admin_pass_hash = generate_password_hash("admin123")
        cursor.execute("INSERT INTO Users (username, password_hash, is_admin) VALUES (?, ?, ?)", ("admin", admin_pass_hash, 1))
        conn.commit()
        
    conn.close()

# Initialize Database immediately
init_db()

# --- CONTEXT PROCESSOR ---
@app.context_processor
def inject_liked_songs():
    liked_song_ids = []
    if 'user_id' in session:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT song_id FROM LikedSongs WHERE user_id = ?", (session['user_id'],))
        liked_song_ids = [row['song_id'] for row in cursor.fetchall()]
        conn.close()
    return dict(liked_song_ids=liked_song_ids)

# --- ROUTES ---

@app.route('/')
def home():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Query recently added songs (limit 6)
    cursor.execute("SELECT * FROM Songs ORDER BY id DESC LIMIT 6")
    recent_songs = [normalize_song(r) for r in cursor.fetchall()]
    
    # Query playlists if logged in
    playlists = []
    if 'user_id' in session:
        cursor.execute("SELECT * FROM Playlists WHERE user_id = ?", (session['user_id'],))
        playlists = cursor.fetchall()
        
    conn.close()
    return render_template('home.html', recent_songs=recent_songs, playlists=playlists, active_page='home')

@app.route('/library')
def library():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Query all songs
    cursor.execute("SELECT * FROM Songs ORDER BY id ASC")
    songs = [normalize_song(r) for r in cursor.fetchall()]
    
    conn.close()
    return render_template('library.html', songs=songs, active_page='library')

@app.route('/about')
def about():
    return render_template('about.html', active_page='about')

# Authentication Routes
@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        
        if not username or not password:
            flash("Please enter both username and password! 🌸", "danger")
            return redirect(url_for('register'))
            
        password_hash = generate_password_hash(password)
        is_admin = 1 if username.lower() == 'admin' else 0
        
        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute("INSERT INTO Users (username, password_hash, is_admin) VALUES (?, ?, ?)", (username, password_hash, is_admin))
            conn.commit()
            user_id = cursor.lastrowid
            
            # Seed default playlists for the new user
            seed_user_playlists(user_id)
            
            flash("Account registered successfully! Please login. 🌸", "success")
            return redirect(url_for('login'))
        except sqlite3.IntegrityError:
            flash("Username already exists! Choose another name. 🌸", "danger")
        finally:
            conn.close()
            
    return render_template('register.html', active_page='register')

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username'].strip()
        password = request.form['password']
        
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM Users WHERE username = ?", (username,))
        user = cursor.fetchone()
        conn.close()
        
        if user and check_password_hash(user['password_hash'], password):
            session['user_id'] = user['id']
            session['username'] = user['username']
            session['is_admin'] = bool(user['is_admin'])
            flash(f"Welcome back, {username}! 🌸", "success")
            return redirect(url_for('home'))
        else:
            flash("Invalid username or password! 🌸💔", "danger")
            
    return render_template('login.html', active_page='login')

@app.route('/logout')
def logout():
    session.clear()
    flash("Logged out successfully. See you soon! 🌸", "success")
    return redirect(url_for('home'))

# Playlists Dashboard
@app.route('/playlists')
def playlists():
    if 'user_id' not in session:
        flash("Please login to manage your playlists! 🌸", "info")
        return redirect(url_for('login'))
        
    conn = get_db_connection()
    cursor = conn.cursor()
    # Get all playlists along with their song counts
    cursor.execute('''
        SELECT Playlists.*, COUNT(PlaylistSongs.song_id) AS song_count
        FROM Playlists
        LEFT JOIN PlaylistSongs ON Playlists.id = PlaylistSongs.playlist_id
        WHERE Playlists.user_id = ?
        GROUP BY Playlists.id
    ''', (session['user_id'],))
    playlists = cursor.fetchall()
    conn.close()
    
    return render_template('playlists.html', playlists=playlists, active_page='playlists')

@app.route('/playlist/<int:playlist_id>')
def playlist_detail(playlist_id):
    if 'user_id' not in session:
        flash("Please login to view your playlists! 🌸", "info")
        return redirect(url_for('login'))
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify owner
    cursor.execute("SELECT * FROM Playlists WHERE id = ? AND user_id = ?", (playlist_id, session['user_id']))
    playlist = cursor.fetchone()
    
    if not playlist:
        conn.close()
        flash("Playlist not found or access denied! 🌸💔", "danger")
        return redirect(url_for('playlists'))
        
    # Get all songs in playlist
    cursor.execute('''
        SELECT Songs.* FROM Songs
        JOIN PlaylistSongs ON Songs.id = PlaylistSongs.song_id
        WHERE PlaylistSongs.playlist_id = ?
    ''', (playlist_id,))
    playlist_songs = [normalize_song(r) for r in cursor.fetchall()]
    
    # Get all songs in the library to populate the add song selection dropdown
    cursor.execute("SELECT id, title FROM Songs ORDER BY title ASC")
    all_songs = cursor.fetchall()
    
    conn.close()
    
    return render_template('playlist_detail.html', 
                           playlist=playlist, 
                           playlist_songs=playlist_songs, 
                           all_songs=all_songs, 
                           active_page='playlists')

# Liked Songs View
@app.route('/liked')
def liked():
    if 'user_id' not in session:
        flash("Please login to save and view your liked songs! 🌸", "info")
        return redirect(url_for('login'))
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Fetch liked songs
    cursor.execute('''
        SELECT Songs.* FROM Songs
        JOIN LikedSongs ON Songs.id = LikedSongs.song_id
        WHERE LikedSongs.user_id = ?
    ''', (session['user_id'],))
    songs = [normalize_song(r) for r in cursor.fetchall()]
    
    conn.close()
    return render_template('liked.html', songs=songs, active_page='liked')

# --- AJAX / API ENDPOINTS ---

# Live Instant Search
@app.route('/api/search')
def api_search():
    query = request.args.get('q', '').strip()
    if not query:
        return jsonify({'songs': [], 'playlists': []})
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Search songs
    cursor.execute("SELECT * FROM Songs WHERE title LIKE ? OR description LIKE ? LIMIT 10", (f"%{query}%", f"%{query}%"))
    songs_rows = cursor.fetchall()
    songs = []
    for s in songs_rows:
        songs.append({
            'id': s['id'],
            'title': s['title'],
            'filepath': s['filename'],
            'coverpath': s['cover_image'],
            'description': s['description']
        })
    
    # Search playlists (if logged in)
    playlists = []
    if 'user_id' in session:
        cursor.execute("SELECT * FROM Playlists WHERE user_id = ? AND name LIKE ? LIMIT 5", (session['user_id'], f"%{query}%"))
        playlists = [dict(p) for p in cursor.fetchall()]
        
    conn.close()
    return jsonify({'songs': songs, 'playlists': playlists})

# Like/Unlike Toggle Action
@app.route('/api/like', methods=['POST'])
def api_like():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.get_json() or {}
    song_id = data.get('song_id')
    user_id = session['user_id']
    
    if not song_id:
        return jsonify({'error': 'Invalid song ID'}), 400
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Check if already liked
    cursor.execute("SELECT id FROM LikedSongs WHERE user_id = ? AND song_id = ?", (user_id, song_id))
    liked_row = cursor.fetchone()
    
    is_liked = False
    if liked_row:
        # Unlike
        cursor.execute("DELETE FROM LikedSongs WHERE id = ?", (liked_row['id'],))
    else:
        # Like
        cursor.execute("INSERT INTO LikedSongs (user_id, song_id) VALUES (?, ?)", (user_id, song_id))
        is_liked = True
        
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'liked': is_liked})

# Add song to playlist
@app.route('/api/playlist/add', methods=['POST'])
def api_playlist_add():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.get_json() or {}
    song_id = data.get('song_id')
    playlist_id = data.get('playlist_id')
    
    if not song_id or not playlist_id:
        return jsonify({'success': False, 'error': 'Missing fields!'})
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify owner
    cursor.execute("SELECT 1 FROM Playlists WHERE id = ? AND user_id = ?", (playlist_id, session['user_id']))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Access denied!'})
        
    # Check if already in playlist
    cursor.execute("SELECT 1 FROM PlaylistSongs WHERE playlist_id = ? AND song_id = ?", (playlist_id, song_id))
    if cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Melody is already in this playlist! 🌸'})
        
    cursor.execute("INSERT INTO PlaylistSongs (playlist_id, song_id) VALUES (?, ?)", (playlist_id, song_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True, 'message': 'Melody added to playlist! 🌸'})

# Remove song from playlist
@app.route('/api/playlist/remove', methods=['POST'])
def api_playlist_remove():
    if 'user_id' not in session:
        return jsonify({'error': 'Unauthorized'}), 401
        
    data = request.get_json() or {}
    song_id = data.get('song_id')
    playlist_id = data.get('playlist_id')
    
    if not song_id or not playlist_id:
        return jsonify({'success': False, 'error': 'Missing fields!'})
        
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Verify owner
    cursor.execute("SELECT 1 FROM Playlists WHERE id = ? AND user_id = ?", (playlist_id, session['user_id']))
    if not cursor.fetchone():
        conn.close()
        return jsonify({'success': False, 'error': 'Access denied!'})
        
    cursor.execute("DELETE FROM PlaylistSongs WHERE playlist_id = ? AND song_id = ?", (playlist_id, song_id))
    conn.commit()
    conn.close()
    
    return jsonify({'success': True})

# --- ADMIN ROUTE & ACTION DISPATCHER ---

@app.route('/admin', methods=['GET', 'POST'])
def admin():
    if 'user_id' not in session or not session.get('is_admin'):
        flash("Admin access required! 🌸💔 Log in with username 'admin' to access.", "danger")
        return redirect(url_for('login'))
        
    if request.method == 'POST':
        action = request.form.get('action')
        
        if action == 'upload':
            title = request.form.get('title', '').strip()
            description = request.form.get('description', '').strip()
            audio_file = request.files.get('audio_file')
            cover_file = request.files.get('cover_file')
            
            if not title or not audio_file or not cover_file:
                flash("Song Title, Audio File, and Cover Image are required! 🌸", "danger")
                return redirect(url_for('admin'))
                
            audio_filename = secure_filename(audio_file.filename)
            cover_filename = secure_filename(cover_file.filename)
            
            if not os.path.exists(app.config['UPLOAD_FOLDER']):
                os.makedirs(app.config['UPLOAD_FOLDER'])
                
            audio_file.save(os.path.join(app.config['UPLOAD_FOLDER'], audio_filename))
            cover_file.save(os.path.join(app.config['UPLOAD_FOLDER'], cover_filename))
            
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                INSERT INTO Songs (title, filename, cover_image, description)
                VALUES (?, ?, ?, ?)
            ''', (title, audio_filename, cover_filename, description))
            conn.commit()
            conn.close()
            
            flash("New nostalgic melody added successfully! 🌸🎵", "success")
            return redirect(url_for('admin'))
            
        elif action == 'edit':
            song_id = request.form.get('song_id')
            title = request.form.get('title', '').strip()
            description = request.form.get('description', '').strip()
            
            if not song_id or not title:
                flash("Song ID and Title are required!", "danger")
                return redirect(url_for('admin'))
                
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute('''
                UPDATE Songs
                SET title = ?, description = ?
                WHERE id = ?
            ''', (title, description, song_id))
            conn.commit()
            conn.close()
            
            flash("Memory details updated successfully! 🌸", "success")
            return redirect(url_for('admin'))
            
        elif action == 'replace_files':
            song_id = request.form.get('song_id')
            if not song_id:
                flash("Song ID is required!", "danger")
                return redirect(url_for('admin'))
                
            audio_file = request.files.get('audio_file')
            cover_file = request.files.get('cover_file')
            
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT filename, cover_image FROM Songs WHERE id = ?", (song_id,))
            current = cursor.fetchone()
            
            if not current:
                conn.close()
                flash("Song not found!", "danger")
                return redirect(url_for('admin'))
                
            updates = []
            params = []
            protected_files = ["caffeine_dream.mp3", "masala_vadai_rush.mp3", "we_are_the_fire.mp3", "ten_feet_tall.mp3", "own_the_stage_tonighht.mp3", "own_the_stage_tonight.mp3", "running_on_gold.mp3", "hostel.png", "canteen.png", "sports.png", "lecture.png", "cultural.png", "culturals.png", "bunk.png"]
            
            if audio_file and audio_file.filename != '':
                audio_filename = secure_filename(audio_file.filename)
                audio_file.save(os.path.join(app.config['UPLOAD_FOLDER'], audio_filename))
                updates.append("filename = ?")
                params.append(audio_filename)
                
                old_audio_path = os.path.join(app.config['UPLOAD_FOLDER'], current['filename'])
                if os.path.exists(old_audio_path) and current['filename'] not in protected_files:
                    try: os.remove(old_audio_path)
                    except Exception: pass
                    
            if cover_file and cover_file.filename != '':
                cover_filename = secure_filename(cover_file.filename)
                cover_file.save(os.path.join(app.config['UPLOAD_FOLDER'], cover_filename))
                updates.append("cover_image = ?")
                params.append(cover_filename)
                
                old_cover_path = os.path.join(app.config['UPLOAD_FOLDER'], current['cover_image'])
                if os.path.exists(old_cover_path) and current['cover_image'] not in protected_files:
                    try: os.remove(old_cover_path)
                    except Exception: pass
                    
            if updates:
                params.append(song_id)
                sql = f"UPDATE Songs SET {', '.join(updates)} WHERE id = ?"
                cursor.execute(sql, params)
                conn.commit()
                flash("Melody files updated successfully! 🌸", "success")
            else:
                flash("No files were uploaded to replace.", "info")
                
            conn.close()
            return redirect(url_for('admin'))
            
        elif action == 'delete':
            song_id = request.form.get('song_id')
            if not song_id:
                flash("Song ID is required!", "danger")
                return redirect(url_for('admin'))
                
            conn = get_db_connection()
            cursor = conn.cursor()
            cursor.execute("SELECT filename, cover_image FROM Songs WHERE id = ?", (song_id,))
            song = cursor.fetchone()
            
            if song:
                audio_path = os.path.join(app.config['UPLOAD_FOLDER'], song['filename'])
                cover_path = os.path.join(app.config['UPLOAD_FOLDER'], song['cover_image'])
                protected_files = ["caffeine_dream.mp3", "masala_vadai_rush.mp3", "we_are_the_fire.mp3", "ten_feet_tall.mp3", "own_the_stage_tonighht.mp3", "own_the_stage_tonight.mp3", "running_on_gold.mp3", "hostel.png", "canteen.png", "sports.png", "lecture.png", "cultural.png", "culturals.png", "bunk.png"]
                
                if os.path.exists(audio_path) and song['filename'] not in protected_files:
                    try: os.remove(audio_path)
                    except Exception: pass
                if os.path.exists(cover_path) and song['cover_image'] not in protected_files:
                    try: os.remove(cover_path)
                    except Exception: pass
                    
                cursor.execute("DELETE FROM Songs WHERE id = ?", (song_id,))
                conn.commit()
                flash("Melody deleted from library! 🌸💔", "success")
            else:
                flash("Song not found!", "danger")
                
            conn.close()
            return redirect(url_for('admin'))

    # GET request
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM Songs ORDER BY id ASC")
    songs = [normalize_song(r) for r in cursor.fetchall()]
    conn.close()
    
    return render_template('admin.html', songs=songs, active_page='admin')

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=49671)
