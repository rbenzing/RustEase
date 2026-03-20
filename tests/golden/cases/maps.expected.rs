use std::collections::HashMap;

fn main() {
    let mut scores: HashMap<String, i32> = HashMap::from([(String::from("Alice"), 95), (String::from("Bob"), 87)]);
    println!("{}", scores["Alice"]);
    scores.insert(String::from("Charlie"), 92);
    println!("{}", scores.len());
    println!("{}", scores.contains_key("Bob"));
}


