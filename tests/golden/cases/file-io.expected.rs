fn main() {
    std::fs::write(String::from("test.txt"), String::from("Hello, World!")).unwrap();
    let content: String = std::fs::read_to_string(String::from("test.txt")).unwrap();
    println!("{}", content);
    let exists: bool = std::path::Path::new(&String::from("test.txt")).exists();
    println!("{}", exists);
    {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new().append(true).create(true).open(String::from("test.txt")).unwrap();
        file.write_all(String::from("\nMore content").as_bytes()).unwrap();
    }
}

