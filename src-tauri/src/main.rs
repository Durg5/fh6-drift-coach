// Drift Coach — Tauri desktop wrapper.
//
// Architecture:
//   1. On startup, find a free TCP port.
//   2. Spawn the bundled Node sidecar binary, pointing it at the embedded
//      Nuxt build output (`.output/server/index.mjs`) with PORT=<chosen>.
//   3. Poll the port until the server answers (max ~30s).
//   4. Create the main webview window pointing at http://127.0.0.1:<port>.
//   5. On window close / app exit, kill the sidecar so we don't leak processes.
//
// The Nuxt output is fully self-contained (Nitro bundles all deps), so the
// only runtime dependency is the Node binary itself, which we ship as a
// Tauri "sidecar" / external binary per platform.

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::net::TcpListener;
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{Manager, RunEvent, WebviewUrl, WebviewWindowBuilder};
use tauri_plugin_shell::process::CommandChild;
use tauri_plugin_shell::ShellExt;

/// We stash the sidecar child handle in app state so we can kill it on exit.
struct SidecarHandle(Mutex<Option<CommandChild>>);

/// Bind to port 0 and read back what the OS gave us. Guaranteed-free.
fn find_free_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind("127.0.0.1:0")?;
    Ok(listener.local_addr()?.port())
}

/// Wait until the sidecar HTTP server starts answering, up to `timeout_s`.
fn wait_for_port(port: u16, timeout_s: u64) -> bool {
    let deadline = Instant::now() + Duration::from_secs(timeout_s);
    let addr: std::net::SocketAddr = format!("127.0.0.1:{}", port).parse().unwrap();
    while Instant::now() < deadline {
        if std::net::TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok() {
            return true;
        }
        std::thread::sleep(Duration::from_millis(200));
    }
    false
}

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .manage(SidecarHandle(Mutex::new(None)))
        .setup(|app| {
            // Pick a free port for the sidecar
            let port = find_free_port().expect("could not find a free TCP port");

            // Resolve the bundled Nuxt output. `nuxt/` is declared as a
            // resource in tauri.conf.json's `bundle.resources`.
            let resource_dir: PathBuf = app
                .path()
                .resolve("nuxt", tauri::path::BaseDirectory::Resource)
                .expect("Nuxt resource directory missing — was it copied into src-tauri/nuxt?");
            let server_entry = resource_dir.join("server").join("index.mjs");

            // Spawn the sidecar. Tauri's shell plugin handles the platform-
            // specific binary name suffix (`node-sidecar-x86_64-pc-windows-msvc.exe`,
            // `node-sidecar-aarch64-apple-darwin`, etc.).
            let sidecar = app
                .shell()
                .sidecar("node-sidecar")
                .expect("node-sidecar binary missing — run `npm run desktop:prep`")
                .args([server_entry.to_string_lossy().to_string()])
                .env("PORT", port.to_string())
                .env("HOST", "127.0.0.1")
                .env("NITRO_PORT", port.to_string())
                .env("NODE_ENV", "production");

            let (_rx, child) = sidecar.spawn().expect("failed to spawn node-sidecar");
            *app.state::<SidecarHandle>().0.lock().unwrap() = Some(child);

            // Wait for the server to come up, then create the window.
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                if !wait_for_port(port, 30) {
                    eprintln!("[drift-coach] sidecar did not start within 30s on port {}", port);
                    handle.exit(1);
                    return;
                }

                let url = format!("http://127.0.0.1:{}/", port);
                let parsed = url.parse().expect("invalid url");

                WebviewWindowBuilder::new(&handle, "main", WebviewUrl::External(parsed))
                    .title("Drift Coach")
                    .inner_size(1600.0, 1000.0)
                    .min_inner_size(1100.0, 720.0)
                    .resizable(true)
                    .decorations(true)
                    .build()
                    .expect("failed to create main window");
            });

            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri app")
        .run(|app_handle, event| match event {
            RunEvent::ExitRequested { .. } | RunEvent::Exit => {
                // Best-effort sidecar cleanup. If kill fails the OS will reap it.
                if let Some(child) = app_handle.state::<SidecarHandle>().0.lock().unwrap().take() {
                    let _ = child.kill();
                }
            }
            _ => {}
        });
}
