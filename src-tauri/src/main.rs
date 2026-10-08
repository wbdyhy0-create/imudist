// Prevents an additional console window on Windows in release builds: this has to sit in the crate of the executable (here),
// it does nothing in lib.rs
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
  imudist_lib::run();
}
