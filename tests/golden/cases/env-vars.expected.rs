fn main() {
    let home: String = std::env::var(String::from("HOME")).unwrap_or_default();
    let port: String = std::env::var(String::from("PORT")).unwrap_or(String::from("8080").to_string());
    println!("{}", home);
    println!("{}", port);
}

