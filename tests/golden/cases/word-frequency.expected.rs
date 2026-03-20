use std::collections::HashMap;

fn main() {
    let text: String = String::from("the cat sat on the mat the cat");
    let words: Vec<String> = text.split(String::from(" ").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
    let mut counts = HashMap::new();
    for word in &words {
        if counts.contains_key(&word) {
            let mut count = counts[&word];
            counts.insert(word, count + 1);
        } else {
            counts.insert(word, 1);
        }
    }
    for word in &words {
        let mut count = counts[&word];
        println!("{}: {}", word, count);
    }
}

