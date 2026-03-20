fn make_tag(tag: String, content: String) -> String {
    return format!("<{}>{}</{}>", tag, content, tag);
}

fn make_hr() -> String {
    return String::from("<hr>");
}

fn main() {
    let markdown: String = String::from("# Hello World\n## Section Two\n### Subsection\n- Item one\n- Item two\n---\nSome paragraph.");
    let lines: Vec<String> = markdown.split(String::from("\n").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
    for line in &lines {
        if line.starts_with(String::from("### ").as_str()) {
            println!("{}", make_tag(String::from("h3"), line.replace(String::from("### ").as_str(), String::from("").as_str())));
        } else if line.starts_with(String::from("## ").as_str()) {
            println!("{}", make_tag(String::from("h2"), line.replace(String::from("## ").as_str(), String::from("").as_str())));
        } else if line.starts_with(String::from("# ").as_str()) {
            println!("{}", make_tag(String::from("h1"), line.replace(String::from("# ").as_str(), String::from("").as_str())));
        } else if line.starts_with(String::from("- ").as_str()) {
            println!("{}", make_tag(String::from("li"), line.replace(String::from("- ").as_str(), String::from("").as_str())));
        } else if line.starts_with(String::from("---").as_str()) {
            println!("{}", make_hr());
        } else {
            println!("{}", make_tag(String::from("p"), line.trim().to_string()));
        }
    }
}

