fn main() {
    let names: Vec<String> = vec![String::from("Alice"), String::from("Bob"), String::from("Charlie")];
    for name in &names {
        println!("{}", name);
    }
}

