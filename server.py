from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from datetime import datetime
import json
import os
import sys
import threading
import webbrowser

# Ensure UTF-8 output encoding on Windows consoles to prevent cp1252 / charmap crashes
if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass
if hasattr(sys.stderr, "reconfigure"):
    try:
        sys.stderr.reconfigure(encoding="utf-8", errors="replace", line_buffering=True)
    except Exception:
        pass

DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 6700

# When packaged by PyInstaller into a standalone executable, assets are in sys._MEIPASS
# while user data (backups, logs, config) lives in the directory containing the executable.
if getattr(sys, "frozen", False) and hasattr(sys, "_MEIPASS"):
    BUNDLE_DIR = Path(sys._MEIPASS).resolve()
    EXE_DIR = Path(sys.executable).resolve().parent
else:
    BUNDLE_DIR = Path(__file__).resolve().parent
    EXE_DIR = BUNDLE_DIR

BASE_DIR = EXE_DIR
BACKUP_DIR = EXE_DIR / "backups"
LOGS_DIR = BACKUP_DIR / "logs"
AUDIO_DIR = EXE_DIR / "audio"
CONFIG_FILE = EXE_DIR / "config.json"

# Ensure runtime directories exist
AUDIO_DIR.mkdir(parents=True, exist_ok=True)

# Active host and port (configurable via CLI, ENV, or config.json)
CURRENT_HOST = DEFAULT_HOST
CURRENT_PORT = DEFAULT_PORT

def normalize_rate(val):
    if not val:
        return "+0%"
    val = str(val).strip()
    if val.endswith("%"):
        if not val.startswith(("+", "-")):
            val = f"+{val}"
        return val
    try:
        f = float(val.replace("x", ""))
        pct = int(round((f - 1.0) * 100))
        return f"+{pct}%" if pct >= 0 else f"{pct}%"
    except Exception:
        return "+0%"

def normalize_pitch(val):
    if not val:
        return "+0Hz"
    val = str(val).strip()
    if val.endswith("Hz"):
        if not val.startswith(("+", "-")):
            val = f"+{val}"
        return val
    return "+0Hz"

VOICE_CATALOG = [
    # Featured Voices
    {"id": "en-US-JennyNeural", "name": "Jenny (US English, Warm & Conversational)", "gender": "Female", "locale": "en-US", "category": "Featured"},
    {"id": "en-US-GuyNeural", "name": "Guy (US English, Casual & Natural)", "gender": "Male", "locale": "en-US", "category": "Featured"},
    {"id": "en-US-AriaNeural", "name": "Aria (US English, Expressive & Broadcast)", "gender": "Female", "locale": "en-US", "category": "Featured"},
    {"id": "en-GB-SoniaNeural", "name": "Sonia (British English, Clear & Elegant)", "gender": "Female", "locale": "en-GB", "category": "Featured"},
    {"id": "en-GB-RyanNeural", "name": "Ryan (British English, Natural & Crisp)", "gender": "Male", "locale": "en-GB", "category": "Featured"},
    {"id": "en-IN-NeerjaNeural", "name": "Neerja (Indian English, Natural & Professional)", "gender": "Female", "locale": "en-IN", "category": "Featured"},
    {"id": "en-IN-PrabhatNeural", "name": "Prabhat (Indian English, Confident & Warm)", "gender": "Male", "locale": "en-IN", "category": "Featured"},

    # US English
    {"id": "en-US-ChristopherNeural", "name": "Christopher (US English, Authoritative Narration)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-EricNeural", "name": "Eric (US English, Documentary Style)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-MichelleNeural", "name": "Michelle (US English, Storyteller & Friendly)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-RogerNeural", "name": "Roger (US English, Deep Storyteller)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-BrianNeural", "name": "Brian (US English, Professional Voiceover)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-EmmaNeural", "name": "Emma (US English, Bright & Cheerful)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-DavisNeural", "name": "Davis (US English, Calm & Relaxed)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AmberNeural", "name": "Amber (US English, Dynamic & Energetic)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AnaNeural", "name": "Ana (US English, Young & Animated)", "gender": "Female", "locale": "en-US", "category": "US English"},
    {"id": "en-US-AndrewNeural", "name": "Andrew (US English, Confident & Smooth)", "gender": "Male", "locale": "en-US", "category": "US English"},
    {"id": "en-US-SteffanNeural", "name": "Steffan (US English, Casual & Youthful)", "gender": "Male", "locale": "en-US", "category": "US English"},

    # UK English
    {"id": "en-GB-LibbyNeural", "name": "Libby (British English, Gentle & Storyteller)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-ThomasNeural", "name": "Thomas (British English, Formal & Prestigious)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-BellaNeural", "name": "Bella (British English, Warm & Bright)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-AlfieNeural", "name": "Alfie (British English, Youthful)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-ElliotNeural", "name": "Elliot (British English, Narrative)", "gender": "Male", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-MaisieNeural", "name": "Maisie (British English, Child/Young)", "gender": "Female", "locale": "en-GB", "category": "UK English"},
    {"id": "en-GB-OliverNeural", "name": "Oliver (British English, Conversational)", "gender": "Male", "locale": "en-GB", "category": "UK English"},

    # Indian English & Hindi
    {"id": "hi-IN-SwaraNeural", "name": "Swara (Hindi, Clear & Melodic)", "gender": "Female", "locale": "hi-IN", "category": "Hindi & Indian"},
    {"id": "hi-IN-MadhurNeural", "name": "Madhur (Hindi, Deep & Expressive)", "gender": "Male", "locale": "hi-IN", "category": "Hindi & Indian"},

    # Australia & Canada
    {"id": "en-AU-NatashaNeural", "name": "Natasha (Australian English, Warm)", "gender": "Female", "locale": "en-AU", "category": "Australia & Canada"},
    {"id": "en-AU-WilliamNeural", "name": "William (Australian English, Clear)", "gender": "Male", "locale": "en-AU", "category": "Australia & Canada"},
    {"id": "en-CA-ClaraNeural", "name": "Clara (Canadian English, Clear)", "gender": "Female", "locale": "en-CA", "category": "Australia & Canada"},
    {"id": "en-CA-LiamNeural", "name": "Liam (Canadian English, Natural)", "gender": "Male", "locale": "en-CA", "category": "Australia & Canada"},

    # European & Global
    {"id": "es-ES-ElviraNeural", "name": "Elvira (Spanish - Spain, Natural)", "gender": "Female", "locale": "es-ES", "category": "European & Global"},
    {"id": "es-ES-AlvaroNeural", "name": "Alvaro (Spanish - Spain, Rich)", "gender": "Male", "locale": "es-ES", "category": "European & Global"},
    {"id": "es-MX-DaliaNeural", "name": "Dalia (Spanish - Mexico, Warm)", "gender": "Female", "locale": "es-MX", "category": "European & Global"},
    {"id": "fr-FR-DeniseNeural", "name": "Denise (French - France, Eloquent)", "gender": "Female", "locale": "fr-FR", "category": "European & Global"},
    {"id": "fr-FR-HenriNeural", "name": "Henri (French - France, Deep)", "gender": "Male", "locale": "fr-FR", "category": "European & Global"},
    {"id": "de-DE-KatjaNeural", "name": "Katja (German - Germany, Crisp)", "gender": "Female", "locale": "de-DE", "category": "European & Global"},
    {"id": "de-DE-ConradNeural", "name": "Conrad (German - Germany, Authoritative)", "gender": "Male", "locale": "de-DE", "category": "European & Global"},
    {"id": "it-IT-ElsaNeural", "name": "Elsa (Italian - Italy, Melodic)", "gender": "Female", "locale": "it-IT", "category": "European & Global"},
    {"id": "it-IT-DiegoNeural", "name": "Diego (Italian - Italy, Expressive)", "gender": "Male", "locale": "it-IT", "category": "European & Global"},
    {"id": "pt-BR-FranciscaNeural", "name": "Francisca (Portuguese - Brazil, Warm)", "gender": "Female", "locale": "pt-BR", "category": "European & Global"},

    # Asian Languages
    {"id": "ja-JP-NanamiNeural", "name": "Nanami (Japanese, Gentle & Clear)", "gender": "Female", "locale": "ja-JP", "category": "Asian Languages"},
    {"id": "ja-JP-KeitaNeural", "name": "Keita (Japanese, Calm & Natural)", "gender": "Male", "locale": "ja-JP", "category": "Asian Languages"},
    {"id": "ko-KR-SunHiNeural", "name": "Sun-Hi (Korean, Clear)", "gender": "Female", "locale": "ko-KR", "category": "Asian Languages"},
    {"id": "zh-CN-XiaoxiaoNeural", "name": "Xiaoxiao (Chinese Mandarin, Expressive)", "gender": "Female", "locale": "zh-CN", "category": "Asian Languages"},
    {"id": "zh-CN-YunxiNeural", "name": "Yunxi (Chinese Mandarin, Dynamic)", "gender": "Male", "locale": "zh-CN", "category": "Asian Languages"}
]


class LocalLibraryHandler(SimpleHTTPRequestHandler):

    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(BUNDLE_DIR), **kwargs)

    def translate_path(self, path):
        # Clean query string
        clean = path.split("?")[0]
        # Route /backups/ requests directly to user's BACKUP_DIR on disk
        if clean.startswith("/backups/"):
            rel = clean[len("/backups/"):].lstrip("/")
            return str(BACKUP_DIR / rel)
        # Route /audio/ or /api/audio/ requests directly to user's AUDIO_DIR on disk
        if clean.startswith("/audio/"):
            rel = clean[len("/audio/"):].lstrip("/")
            return str(AUDIO_DIR / rel)
        if clean.startswith("/api/audio/"):
            rel = clean[len("/api/audio/"):].lstrip("/")
            return str(AUDIO_DIR / rel)
        # Check if file exists in EXE_DIR (allows user customization outside the bundle)
        exe_target = EXE_DIR / clean.lstrip("/")
        if exe_target.exists() and not exe_target.is_dir():
            return str(exe_target)
        return super().translate_path(path)

    def end_headers(self):
        # Enable CORS for local cross-origin development flexibility
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.end_headers()

    def do_POST(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/save-backup":
            self.handle_save_backup()
        elif clean_path == "/api/update-backup":
            self.handle_update_backup()
        elif clean_path == "/api/log":
            self.handle_log()
        elif clean_path in ("/api/open-folder", "/api/open-logs", "/api/open-audio"):
            self.handle_open_folder()
        elif clean_path == "/api/tts/generate":
            self.handle_tts_generate()
        elif clean_path == "/api/tts/delete":
            self.handle_tts_delete()
        else:
            self.send_json_response({"success": False, "error": f"Endpoint not found: {clean_path}"}, 404)

    def handle_open_folder(self):
        target_dir = LOGS_DIR
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            clean_path = self.path.split("?")[0].rstrip("/")
            folder_target = "audio" if clean_path == "/api/open-audio" else "logs"
            if content_length > 0:
                body = self.rfile.read(content_length)
                try:
                    payload = json.loads(body.decode("utf-8"))
                    folder_target = payload.get("folder", folder_target)
                except Exception:
                    pass

            if folder_target == "audio":
                target_dir = AUDIO_DIR
            elif folder_target == "backups":
                target_dir = BACKUP_DIR
            else:
                target_dir = LOGS_DIR
            target_dir.mkdir(parents=True, exist_ok=True)

            opened = False
            if sys.platform.startswith("win"):
                try:
                    os.startfile(str(target_dir))
                    opened = True
                except Exception:
                    try:
                        import subprocess
                        subprocess.Popen(["explorer", str(target_dir)])
                        opened = True
                    except Exception:
                        pass
            elif sys.platform.startswith("darwin"):
                import subprocess
                subprocess.Popen(["open", str(target_dir)])
                opened = True
            else:
                import subprocess
                subprocess.Popen(["xdg-open", str(target_dir)])
                opened = True

            print(f"[Folder] Opened in Explorer: {target_dir}")
            self.send_json_response({
                "success": True,
                "opened": opened,
                "path": str(target_dir)
            })
        except Exception as e:
            print(f"[Folder Error] Could not open {target_dir}: {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_log(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            LOGS_DIR.mkdir(parents=True, exist_ok=True)
            today_str = datetime.now().strftime("%Y-%m-%d")
            log_file = LOGS_DIR / f"app-{today_str}.log"

            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            tab = payload.get("tab", "app")
            action = payload.get("action", "")
            details = payload.get("details", None)

            detail_str = ""
            if details is not None:
                if isinstance(details, (dict, list)):
                    try:
                        detail_str = f" | Details: {json.dumps(details, ensure_ascii=False)}"
                    except Exception:
                        detail_str = f" | Details: {str(details)}"
                else:
                    detail_str = f" | Details: {str(details)}"

            line = f"[{timestamp}] [{tab}] {action}{detail_str}\n"

            with open(log_file, "a", encoding="utf-8") as f:
                f.write(line)
                f.flush()
                try:
                    os.fsync(f.fileno())
                except Exception:
                    pass

            print(f"[Log] [{tab}] {action}")
            self.send_json_response({"success": True, "file": log_file.name})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_update_backup(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            data = payload.get("data")
            if not data:
                self.send_json_response({"success": False, "error": "Missing backup data"}, 400)
                return

            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            overwrite = payload.get("overwrite", False)
            target_filename = payload.get("filename")

            if overwrite and target_filename and (BACKUP_DIR / target_filename).exists():
                filename = target_filename
            else:
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"library-backup-{timestamp}.json"

            backup_path = BACKUP_DIR / filename
            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            print(f"[Backup Update] Saved to: {backup_path}")
            self.send_json_response({
                "success": True,
                "filename": filename,
                "path": str(backup_path),
                "overwritten": overwrite
            })
        except Exception as e:
            print(f"[Backup Update Error] {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_save_backup(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            data = json.loads(body.decode("utf-8"))

            BACKUP_DIR.mkdir(parents=True, exist_ok=True)

            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"library-backup-{timestamp}.json"
            backup_path = BACKUP_DIR / filename

            with open(backup_path, "w", encoding="utf-8") as f:
                json.dump(data, f, ensure_ascii=False, indent=2)

            # Also keep a copy or link if needed
            print(f"[Backup] Successfully saved: {backup_path} ({len(body)} bytes)")

            self.send_json_response({
                "success": True,
                "filename": filename,
                "path": str(backup_path),
                "timestamp": timestamp
            })

        except Exception as e:
            print(f"[Backup Error] {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def do_GET(self):
        clean_path = self.path.split("?")[0].rstrip("/")
        if clean_path == "/api/status":
            self.send_json_response({
                "status": "online",
                "app": "Panda Studio",
                "host": CURRENT_HOST,
                "port": CURRENT_PORT,
                "url": f"http://localhost:{CURRENT_PORT}",
                "backup_dir": str(BACKUP_DIR),
                "logs_dir": str(LOGS_DIR),
                "audio_dir": str(AUDIO_DIR)
            })
            return
        elif clean_path == "/api/latest-backup":
            self.handle_get_latest_backup()
            return
        elif clean_path == "/api/logs":
            self.handle_get_logs()
            return
        elif clean_path in ("/api/open-folder", "/api/open-logs", "/api/open-audio"):
            self.handle_open_folder()
            return
        elif clean_path == "/api/tts/voices":
            self.handle_get_tts_voices()
            return
        elif clean_path == "/api/tts/history":
            self.handle_get_tts_history()
            return
        if clean_path.startswith("/api/"):
            self.send_json_response({"success": False, "error": f"Endpoint not found: {clean_path}"}, 404)
            return
        super().do_GET()

    def handle_get_latest_backup(self):
        try:
            if not BACKUP_DIR.exists():
                self.send_json_response({"success": False, "error": "Backups directory does not exist yet."})
                return

            backup_files = sorted(
                list(BACKUP_DIR.glob("library-backup-*.json")) or list(BACKUP_DIR.glob("*.json")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            # Filter out non-backup files (ensure it has items and groups)
            valid_backups = []
            for bf in backup_files:
                try:
                    with open(bf, "r", encoding="utf-8") as f:
                        test_load = json.load(f)
                    if isinstance(test_load, dict) and "items" in test_load and "groups" in test_load:
                        valid_backups.append((bf, test_load))
                except Exception:
                    continue

            if not valid_backups:
                self.send_json_response({"success": False, "error": "No valid backup JSON files found."})
                return

            latest_file, data = valid_backups[0]

            self.send_json_response({
                "success": True,
                "filename": latest_file.name,
                "mtime": latest_file.stat().st_mtime,
                "data": data
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_get_logs(self):
        try:
            if not LOGS_DIR.exists():
                self.send_json_response({"success": True, "files": [], "logs_dir": str(LOGS_DIR)})
                return

            log_files = sorted(
                list(LOGS_DIR.glob("*.log")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )
            files_meta = [{"name": f.name, "size": f.stat().st_size, "mtime": f.stat().st_mtime} for f in log_files]
            self.send_json_response({
                "success": True,
                "files": files_meta,
                "logs_dir": str(LOGS_DIR)
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def send_json_response(self, payload, code=200):
        body = json.dumps(payload).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def handle_get_tts_voices(self):
        try:
            self.send_json_response({
                "success": True,
                "voices": VOICE_CATALOG,
                "total": len(VOICE_CATALOG),
                "defaultVoice": "en-US-JennyNeural"
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_get_tts_history(self):
        try:
            if not AUDIO_DIR.exists():
                self.send_json_response({"success": True, "files": [], "audio_dir": str(AUDIO_DIR)})
                return

            mp3_files = sorted(
                list(AUDIO_DIR.glob("*.mp3")),
                key=lambda p: p.stat().st_mtime,
                reverse=True
            )

            history = []
            for f in mp3_files:
                meta_file = f.with_suffix(".json")
                item = {
                    "filename": f.name,
                    "url": f"/audio/{f.name}",
                    "size": f.stat().st_size,
                    "mtime": f.stat().st_mtime,
                    "createdAt": int(f.stat().st_mtime * 1000),
                    "voice": "en-US-JennyNeural",
                    "text": ""
                }
                if meta_file.exists():
                    try:
                        with open(meta_file, "r", encoding="utf-8") as mf:
                            loaded_meta = json.load(mf)
                            item.update(loaded_meta)
                    except Exception:
                        pass
                history.append(item)

            self.send_json_response({
                "success": True,
                "files": history,
                "audio_dir": str(AUDIO_DIR)
            })
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_tts_delete(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))
            filename = payload.get("filename", "").strip()

            if not filename:
                self.send_json_response({"success": False, "error": "Filename required"}, 400)
                return

            clean_name = Path(filename).name
            target = AUDIO_DIR / clean_name
            meta_target = target.with_suffix(".json")

            deleted = False
            if target.exists():
                target.unlink()
                deleted = True
            if meta_target.exists():
                meta_target.unlink()

            print(f"[TTS Delete] Deleted: {clean_name}")
            self.send_json_response({"success": True, "deleted": deleted, "filename": clean_name})
        except Exception as e:
            self.send_json_response({"success": False, "error": str(e)}, 500)

    def handle_tts_generate(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            if content_length <= 0:
                self.send_json_response({"success": False, "error": "Empty request body"}, 400)
                return

            body = self.rfile.read(content_length)
            payload = json.loads(body.decode("utf-8"))

            text = payload.get("text", "").strip()
            if not text:
                self.send_json_response({"success": False, "error": "Text is required to generate speech"}, 400)
                return

            voice = payload.get("voice", "en-US-JennyNeural").strip() or "en-US-JennyNeural"
            rate = normalize_rate(payload.get("rate", "+0%"))
            pitch = normalize_pitch(payload.get("pitch", "+0Hz"))
            volume = payload.get("volume", "+0%").strip() or "+0%"

            AUDIO_DIR.mkdir(parents=True, exist_ok=True)
            timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
            voice_short = voice.split("-")[-1].replace("Neural", "").lower()

            custom_name = payload.get("filename", "").strip()
            if custom_name:
                base_clean = "".join(c for c in custom_name if c.isalnum() or c in ("-", "_", " ")).strip().replace(" ", "_")
                if not base_clean:
                    base_clean = f"tts_{timestamp_str}_{voice_short}"
                filename = f"{base_clean}.mp3" if not base_clean.lower().endswith(".mp3") else base_clean
            else:
                filename = f"tts_{timestamp_str}_{voice_short}.mp3"

            output_file = AUDIO_DIR / filename
            counter = 1
            stem = output_file.stem
            while output_file.exists():
                output_file = AUDIO_DIR / f"{stem}_{counter}.mp3"
                counter += 1
            filename = output_file.name

            # Generate speech using edge-tts
            try:
                import edge_tts
                import asyncio

                async def _speak():
                    communicate = edge_tts.Communicate(
                        text=text,
                        voice=voice,
                        rate=rate,
                        pitch=pitch,
                        volume=volume
                    )
                    await communicate.save(str(output_file))

                asyncio.run(_speak())

            except ImportError:
                self.send_json_response({
                    "success": False,
                    "error": "The 'edge-tts' package is missing. Please run 'pip install edge-tts'."
                }, 500)
                return
            except Exception as tts_err:
                print(f"[TTS Error] Generation failed: {tts_err}")
                self.send_json_response({
                    "success": False,
                    "error": f"TTS synthesis failed: {str(tts_err)}. Please verify your internet connection."
                }, 500)
                return

            if not output_file.exists() or output_file.stat().st_size == 0:
                self.send_json_response({
                    "success": False,
                    "error": "Audio file was not generated or is empty."
                }, 500)
                return

            file_size = output_file.stat().st_size
            now_ms = int(datetime.now().timestamp() * 1000)

            # Save metadata .json alongside the .mp3
            meta = {
                "filename": filename,
                "voice": voice,
                "text": text,
                "rate": rate,
                "pitch": pitch,
                "volume": volume,
                "size": file_size,
                "createdAt": now_ms
            }
            meta_path = output_file.with_suffix(".json")
            try:
                with open(meta_path, "w", encoding="utf-8") as mf:
                    json.dump(meta, mf, ensure_ascii=False, indent=2)
            except Exception as e:
                print(f"[TTS Warning] Could not save metadata: {e}")

            print(f"[TTS] Generated audio: {filename} ({file_size} bytes, voice: {voice})")

            self.send_json_response({
                "success": True,
                "filename": filename,
                "url": f"/audio/{filename}",
                "size": file_size,
                "voice": voice,
                "rate": rate,
                "pitch": pitch,
                "text": text,
                "createdAt": now_ms
            })

        except Exception as e:
            print(f"[TTS Error] Request failed: {e}")
            self.send_json_response({"success": False, "error": str(e)}, 500)


def load_configuration(cli_args=None):
    """
    Resolves host and port configuration using precedence:
    1. CLI arguments (-p, --port, or positional port)
    2. Environment variables (PORT, PANDA_PORT, HOST)
    3. config.json in root directory
    4. Default: host 127.0.0.1, port 6700
    """
    global CURRENT_HOST, CURRENT_PORT

    host = DEFAULT_HOST
    port = DEFAULT_PORT
    auto_open = True
    config_source = f"default ({DEFAULT_PORT})"

    # 1. Check config.json if present (check user's EXE directory first, fallback to bundle)
    target_config = CONFIG_FILE if CONFIG_FILE.exists() else (BUNDLE_DIR / "config.json")
    if target_config.exists():
        try:
            with open(target_config, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            if isinstance(cfg, dict):
                if "port" in cfg and isinstance(cfg["port"], (int, str)):
                    port = int(cfg["port"])
                    config_source = f"config.json ({target_config.name})"
                if "host" in cfg and isinstance(cfg["host"], str):
                    host = cfg["host"]
                if "auto_open_browser" in cfg:
                    auto_open = bool(cfg["auto_open_browser"])
        except Exception as e:
            print(f"[Config Warning] Could not parse config.json: {e}")

    # 2. Check environment variables
    env_port = os.environ.get("PORT") or os.environ.get("PANDA_PORT")
    if env_port:
        try:
            port = int(env_port)
            config_source = f"environment variable (PORT={env_port})"
        except ValueError:
            pass

    env_host = os.environ.get("HOST") or os.environ.get("PANDA_HOST")
    if env_host:
        host = env_host

    # 3. Check CLI arguments
    import argparse
    parser = argparse.ArgumentParser(description="Panda Studio Local Server")
    parser.add_argument("port_pos", nargs="?", type=int, help="Port number (e.g. 6700)")
    parser.add_argument("-p", "--port", type=int, help="Port number (e.g. 6700)")
    parser.add_argument("-H", "--host", type=str, help="Host address (default: 127.0.0.1)")
    parser.add_argument("--no-browser", action="store_true", help="Do not automatically open browser on startup")

    parsed, _ = parser.parse_known_args(cli_args)
    cli_port = parsed.port or parsed.port_pos
    if cli_port:
        port = cli_port
        config_source = f"command-line argument (--port {port})"

    if parsed.host:
        host = parsed.host

    if parsed.no_browser:
        auto_open = False

    CURRENT_HOST = host
    CURRENT_PORT = port

    return host, port, auto_open, config_source


def main():
    host, port, auto_open, source = load_configuration()

    print()
    print("=" * 60)
    print(" 🐼 Panda Studio - Content Creation Platform")
    print("=" * 60)
    print(f" Directory  : {BASE_DIR}")
    print(f" Backups    : {BACKUP_DIR}")
    print(f" Logs       : {LOGS_DIR}")
    print(f" Port Source: {source}")
    print(f" Local URL  : http://localhost:{port}")
    print(f" Network    : http://{host}:{port}")
    print("=" * 60)
    print(" Press Ctrl+C in this terminal window to stop.")
    print("=" * 60)
    print()

    server = ThreadingHTTPServer((host, port), LocalLibraryHandler)
    if auto_open:
        threading.Timer(0.8, lambda: webbrowser.open(f"http://localhost:{port}")).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping server gracefully...")
        server.server_close()
        sys.exit(0)


if __name__ == "__main__":
    main()
