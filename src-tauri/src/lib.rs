use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::{
  fs,
  path::PathBuf,
  process::Command,
  sync::{
    atomic::{AtomicU64, Ordering},
    OnceLock,
  },
  time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use tauri::{Manager, Wry};
use tauri_plugin_fs::FsExt;

static EPS_TEMP_SEQUENCE: AtomicU64 = AtomicU64::new(0);
const MAX_EPS_BYTES: usize = 50 * 1024 * 1024;
const MAX_PDF_BYTES: u64 = 100 * 1024 * 1024;

#[tauri::command]
fn app_name() -> &'static str {
  "Imudist"
}

#[tauri::command]
fn remember_recent_file(app: tauri::AppHandle<Wry>, path: String) -> Result<(), String> {
  let path = PathBuf::from(path);
  let is_document = path.extension().and_then(|extension| extension.to_str()).map(|extension| extension.eq_ignore_ascii_case("imudist")) == Some(true);
  if !path.is_absolute() || !path.is_file() || !is_document {
    return Err("Only existing Imudist documents can be remembered.".into());
  }

  app.fs_scope().allow_file(&path).map_err(|error| error.to_string())?;
  let recent_file = app.path().app_local_data_dir().map_err(|error| error.to_string())?.join("recent-files.json");
  let mut paths: Vec<String> = fs::read_to_string(&recent_file)
    .ok()
    .and_then(|contents| serde_json::from_str(&contents).ok())
    .unwrap_or_default();
  let path = path.to_string_lossy().into_owned();
  paths.retain(|known| !known.eq_ignore_ascii_case(&path));
  paths.insert(0, path);
  paths.truncate(10);
  let parent = recent_file.parent().ok_or_else(|| "Could not resolve app data directory.".to_owned())?;
  fs::create_dir_all(parent).map_err(|error| error.to_string())?;
  fs::write(recent_file, serde_json::to_vec(&paths).map_err(|error| error.to_string())?).map_err(|error| error.to_string())
}

const MAX_LINKED_IMAGE_BYTES: u64 = 50 * 1024 * 1024;
const LINKED_IMAGE_EXTENSIONS: [&str; 8] = ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "avif"];

#[derive(serde::Serialize)]
struct LinkStat {
  size: u64,
  /// last modification, milliseconds since the Unix epoch
  mtime: u64,
}

/// A linked picture's path comes out of a saved document, so only absolute paths of picture files are ever touched.
fn linked_image_path(path: &str) -> Result<PathBuf, String> {
  let path = PathBuf::from(path);
  let is_picture = path
    .extension()
    .and_then(|extension| extension.to_str())
    .map(|extension| LINKED_IMAGE_EXTENSIONS.iter().any(|known| extension.eq_ignore_ascii_case(known)))
    == Some(true);
  if !path.is_absolute() || !is_picture {
    return Err("Only absolute paths of picture files can be linked.".into());
  }
  Ok(path)
}

fn stat_of(path: &str) -> Option<LinkStat> {
  let path = linked_image_path(path).ok()?;
  let metadata = fs::metadata(path).ok().filter(|metadata| metadata.is_file())?;
  let mtime = metadata.modified().ok()?.duration_since(UNIX_EPOCH).ok()?.as_millis() as u64;
  Some(LinkStat { size: metadata.len(), mtime })
}

#[tauri::command]
async fn read_linked_image(path: String) -> Result<tauri::ipc::Response, String> {
  tauri::async_runtime::spawn_blocking(move || {
    let path = linked_image_path(&path)?;
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() {
      return Err("The linked picture is not a file.".to_owned());
    }
    if metadata.len() > MAX_LINKED_IMAGE_BYTES {
      return Err("The linked picture is too large (over 50MB).".to_owned());
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
  })
  .await
  .map_err(|error| error.to_string())?
}

/// The size and modification time of each path, or null for a file that is missing: how the app notices a changed or lost link.
#[tauri::command]
async fn stat_linked_images(paths: Vec<String>) -> Result<Vec<Option<LinkStat>>, String> {
  tauri::async_runtime::spawn_blocking(move || paths.iter().map(|path| stat_of(path)).collect())
    .await
    .map_err(|error| error.to_string())
}

#[derive(serde::Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct SystemFont {
  family: String,
  full_name: String,
  postscript_name: String,
  style: String,
  path: String,
}

/// The style name of a face as the font lists of the program read it ("Regular", "Bold Italic", "Light" ...)
fn font_style_name(weight: u16, style: fontdb::Style) -> String {
  let weight_name = match ((weight + 50) / 100).clamp(1, 9) {
    1 => "Thin",
    2 => "ExtraLight",
    3 => "Light",
    4 => "Regular",
    5 => "Medium",
    6 => "SemiBold",
    7 => "Bold",
    8 => "ExtraBold",
    _ => "Black",
  };
  let slant = match style {
    fontdb::Style::Normal => None,
    fontdb::Style::Italic => Some("Italic"),
    fontdb::Style::Oblique => Some("Oblique"),
  };
  match slant {
    None => weight_name.to_owned(),
    Some(slant) if weight_name == "Regular" => slant.to_owned(),
    Some(slant) => format!("{weight_name} {slant}"),
  }
}

/// The fonts installed on the computer, read once: where the web view has no list of them of its own (the Mac's), the program asks for this one.
fn installed_fonts() -> &'static Vec<SystemFont> {
  static FONTS: OnceLock<Vec<SystemFont>> = OnceLock::new();
  FONTS.get_or_init(|| {
    let mut database = fontdb::Database::new();
    database.load_system_fonts();
    database
      .faces()
      .filter_map(|face| {
        let path = match &face.source {
          fontdb::Source::File(path) => path.clone(),
          fontdb::Source::SharedFile(path, _) => path.clone(),
          fontdb::Source::Binary(_) => return None,
        };
        let family = face.families.first()?.0.clone();
        let style = font_style_name(face.weight.0, face.style);
        Some(SystemFont { full_name: format!("{family} {style}"), family, postscript_name: face.post_script_name.clone(), style, path: path.to_string_lossy().into_owned() })
      })
      .collect()
  })
}

#[tauri::command]
async fn list_system_fonts() -> Result<Vec<SystemFont>, String> {
  tauri::async_runtime::spawn_blocking(|| installed_fonts().clone()).await.map_err(|error| error.to_string())
}

const MAX_FONT_BYTES: u64 = 50 * 1024 * 1024;

/// The file of one of the installed fonts (put in the PDF a text is written in); only the paths `list_system_fonts` gave are read.
#[tauri::command]
async fn read_system_font(path: String) -> Result<tauri::ipc::Response, String> {
  tauri::async_runtime::spawn_blocking(move || {
    if !installed_fonts().iter().any(|font| font.path == path) {
      return Err("Only the files of installed fonts can be read.".to_owned());
    }
    let metadata = fs::metadata(&path).map_err(|error| error.to_string())?;
    if !metadata.is_file() || metadata.len() > MAX_FONT_BYTES {
      return Err("The font file is not usable.".to_owned());
    }
    fs::read(&path).map(tauri::ipc::Response::new).map_err(|error| error.to_string())
  })
  .await
  .map_err(|error| error.to_string())?
}

#[tauri::command]
fn convert_eps_to_pdf(source_base64: String) -> Result<String, String> {
  let source = STANDARD.decode(source_base64).map_err(|_| "לא ניתן לקרוא את נתוני קובץ ה-EPS.".to_owned())?;
  if source.len() > MAX_EPS_BYTES {
    return Err("קובץ ה-EPS גדול מדי (מעל 50MB).".into());
  }
  // PostScript printed to a file often starts with a Ctrl-D or a printer-job header before "%!", and old EPS files start with a binary header
  let head = &source[..source.len().min(1024)];
  if !source.starts_with(&[0xC5, 0xD0, 0xD3, 0xC6]) && !head.windows(2).any(|pair| pair == b"%!") {
    return Err("הקובץ אינו EPS/PostScript תקין.".into());
  }

  let nonce = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_nanos();
  let temp_dir = std::env::temp_dir().join(format!("imudist-eps-{}-{nonce}-{}", std::process::id(), EPS_TEMP_SEQUENCE.fetch_add(1, Ordering::Relaxed)));
  let result = (|| {
    fs::create_dir(&temp_dir).map_err(|error| format!("לא ניתן ליצור תיקיית המרה זמנית: {error}"))?;
    let input_path = temp_dir.join("source.eps");
    let output_path = temp_dir.join("converted.pdf");
    fs::write(&input_path, source).map_err(|error| format!("לא ניתן לכתוב את קובץ ה-EPS הזמני: {error}"))?;

    let input_arg = input_path.to_string_lossy().into_owned();
    let output_arg = format!("-sOutputFile={}", output_path.to_string_lossy());
    let mut executables = if cfg!(windows) {
      vec![PathBuf::from("gswin64c.exe"), PathBuf::from("gswin32c.exe"), PathBuf::from("gs")]
    } else {
      vec![PathBuf::from("gs")]
    };
    if cfg!(target_os = "macos") {
      // an app opened from the Finder does not get the shell's PATH: Homebrew (Apple silicon and Intel) and MacPorts are looked for where they install
      for directory in ["/opt/homebrew/bin", "/usr/local/bin", "/opt/local/bin", "/usr/bin"] {
        let candidate = PathBuf::from(directory).join("gs");
        if candidate.is_file() { executables.push(candidate); }
      }
    }
    if cfg!(windows) {
      for variable in ["ProgramFiles", "ProgramFiles(x86)"] {
        let Some(program_files) = std::env::var_os(variable) else { continue };
        let versions_dir = PathBuf::from(program_files).join("gs");
        let mut versions: Vec<PathBuf> = fs::read_dir(versions_dir)
          .into_iter()
          .flatten()
          .filter_map(Result::ok)
          .map(|entry| entry.path())
          .collect();
        versions.sort();
        versions.reverse();
        for version in versions {
          for binary in ["gswin64c.exe", "gswin32c.exe"] {
            let candidate = version.join("bin").join(binary);
            if candidate.is_file() { executables.push(candidate); }
          }
        }
      }
    }
    let mut found_ghostscript = false;
    let mut last_error = String::new();
    for executable in executables {
      let mut child = match Command::new(&executable)
        .args(["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dEPSCrop", "-dFirstPage=1", "-dLastPage=1", "-dQUIET", "-sDEVICE=pdfwrite", output_arg.as_str(), input_arg.as_str()])
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::piped())
        .spawn()
      {
        Ok(child) => child,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => continue,
        Err(error) => return Err(format!("לא ניתן להפעיל את Ghostscript: {error}")),
      };
      found_ghostscript = true;
      let started = Instant::now();
      let status = loop {
        if let Some(status) = child.try_wait().map_err(|error| format!("שגיאה בזמן המרת EPS: {error}"))? {
          break status;
        }
        if started.elapsed() > Duration::from_secs(30) {
          let _ = child.kill();
          let _ = child.wait();
          return Err("המרת קובץ ה-EPS נמשכה יותר מדי זמן והופסקה.".into());
        }
        std::thread::sleep(Duration::from_millis(40));
      };
      if !status.success() {
        let mut stderr = String::new();
        if let Some(stream) = child.stderr.take() {
          use std::io::Read;
          let _ = stream.take(4096).read_to_string(&mut stderr);
        }
        last_error = stderr.trim().to_owned();
        continue;
      }
      break;
    }
    if !found_ghostscript {
      // a fixed code: the app shows its own explanation and a download button for it (see importEps.ts)
      return Err("GHOSTSCRIPT_MISSING".into());
    }
    if !output_path.is_file() {
      return Err(if last_error.is_empty() { "Ghostscript לא יצר קובץ PDF וקטורי.".into() } else { format!("Ghostscript לא הצליח להמיר את הקובץ: {last_error}") });
    }
    let metadata = fs::metadata(&output_path).map_err(|error| format!("לא ניתן לבדוק את תוצאת ההמרה: {error}"))?;
    if metadata.len() > MAX_PDF_BYTES {
      return Err("קובץ ה-PDF שנוצר גדול מדי (מעל 100MB).".into());
    }
    fs::read(&output_path).map(|bytes| STANDARD.encode(bytes)).map_err(|error| format!("לא ניתן לקרוא את תוצאת ההמרה: {error}"))
  })();
  let _ = fs::remove_dir_all(temp_dir);
  result
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_dialog::init())
    .plugin(tauri_plugin_fs::init())
    .plugin(tauri_plugin_opener::init())
    .setup(|app| {
      let recent_file = app.path().app_local_data_dir()?.join("recent-files.json");
      if let Ok(contents) = fs::read_to_string(recent_file) {
        if let Ok(paths) = serde_json::from_str::<Vec<String>>(&contents) {
          for path in paths {
            let path = PathBuf::from(path);
            let is_document = path.extension().and_then(|extension| extension.to_str()).map(|extension| extension.eq_ignore_ascii_case("imudist")) == Some(true);
            if path.is_file() && is_document {
              if let Err(error) = app.fs_scope().allow_file(path) {
                eprintln!("Could not restore recent document access: {error}");
              }
            }
          }
        }
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![app_name, remember_recent_file, convert_eps_to_pdf, read_linked_image, stat_linked_images, list_system_fonts, read_system_font])
    .run(tauri::generate_context!())
    .expect("error while running Imudist");
}

#[cfg(test)]
mod tests {
  use super::font_style_name;

  #[test]
  fn font_styles_are_named_as_the_font_lists_read_them() {
    assert_eq!(font_style_name(400, fontdb::Style::Normal), "Regular");
    assert_eq!(font_style_name(700, fontdb::Style::Normal), "Bold");
    assert_eq!(font_style_name(400, fontdb::Style::Italic), "Italic");
    assert_eq!(font_style_name(700, fontdb::Style::Italic), "Bold Italic");
    assert_eq!(font_style_name(300, fontdb::Style::Oblique), "Light Oblique");
    assert_eq!(font_style_name(600, fontdb::Style::Normal), "SemiBold");
  }
}
