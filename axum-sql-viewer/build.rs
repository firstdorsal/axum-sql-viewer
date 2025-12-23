use std::fs;
use std::path::Path;
use std::process::Command;

fn main() {
    let frontend_directory = Path::new("frontend");
    let distribution_directory = frontend_directory.join("dist");

    // Track all frontend source files for rebuilds
    println!("cargo:rerun-if-changed=frontend/src");
    println!("cargo:rerun-if-changed=frontend/package.json");
    println!("cargo:rerun-if-changed=frontend/pnpm-lock.yaml");
    println!("cargo:rerun-if-changed=frontend/vite.config.ts");
    println!("cargo:rerun-if-changed=frontend/tsconfig.json");
    println!("cargo:rerun-if-changed=frontend/tailwind.config.js");

    // Recursively track all files in src directory
    track_directory("frontend/src");

    // If dist already exists (e.g., during cargo publish), skip building
    // This is necessary because cargo publish verifies the package in a temp directory
    // and build scripts cannot modify the source directory
    if distribution_directory.exists() && distribution_directory.join("index.html").exists() {
        println!("cargo:warning=Frontend distribution already exists, skipping build");
        println!("cargo:rerun-if-changed=frontend/dist");
        return;
    }

    // Check if we should build the frontend
    if frontend_directory.exists() {
        println!("cargo:warning=Building frontend...");

        // Install dependencies if node_modules doesn't exist
        if !frontend_directory.join("node_modules").exists() {
            println!("cargo:warning=Installing frontend dependencies...");
            let install_status = Command::new("pnpm")
                .args(["install"])
                .current_dir(frontend_directory)
                .status();

            match install_status {
                Ok(status) if status.success() => {
                    println!("cargo:warning=Frontend dependencies installed successfully");
                }
                Ok(status) => {
                    println!("cargo:warning=pnpm install failed with status: {}", status);
                    println!("cargo:warning=Frontend will use placeholder page");
                    return;
                }
                Err(_error) => {
                    println!("cargo:warning=Failed to run pnpm install");
                    println!("cargo:warning=Make sure pnpm is installed");
                    println!("cargo:warning=Frontend will use placeholder page");
                    return;
                }
            }
        }

        // Build the frontend
        println!("cargo:warning=Running pnpm build...");
        let build_status = Command::new("pnpm")
            .args(["build"])
            .current_dir(frontend_directory)
            .status();

        match build_status {
            Ok(status) if status.success() => {
                println!("cargo:warning=Frontend built successfully");
                if distribution_directory.exists() {
                    println!("cargo:rerun-if-changed=frontend/dist");
                }
            }
            Ok(status) => {
                println!("cargo:warning=pnpm build failed with status: {}", status);
                println!("cargo:warning=Frontend will use placeholder page");
            }
            Err(_error) => {
                println!("cargo:warning=Failed to run pnpm build");
                println!("cargo:warning=Make sure pnpm is installed");
                println!("cargo:warning=Frontend will use placeholder page");
            }
        }
    } else {
        println!("cargo:warning=Frontend directory not found");
        println!("cargo:warning=The SQL viewer will show a placeholder page");
    }
}

fn track_directory(directory: &str) {
    let path = Path::new(directory);
    if !path.exists() {
        return;
    }

    if let Ok(entries) = fs::read_dir(path) {
        for entry in entries.flatten() {
            let entry_path = entry.path();
            if entry_path.is_dir() {
                if let Some(path_string) = entry_path.to_str() {
                    track_directory(path_string);
                }
            } else if let Some(path_string) = entry_path.to_str() {
                println!("cargo:rerun-if-changed={}", path_string);
            }
        }
    }
}
