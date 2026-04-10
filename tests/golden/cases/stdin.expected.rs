fn main() {
    let name: String = {
        print!("{}", String::from("Enter your name: "));
        std::io::Write::flush(&mut std::io::stdout()).unwrap();
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        input.trim().to_string()
    };
    println!("{}", format!("{}{}", String::from("Hello, "), name));
    let line: String = {
        let mut input = String::new();
        std::io::stdin().read_line(&mut input).unwrap();
        input.trim().to_string()
    };
    println!("{}", line);
}

