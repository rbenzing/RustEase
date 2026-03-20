fn main() {
    let arguments: Vec<String> = std::env::args().collect::<Vec<String>>();
    let count: i32 = std::env::args().count() as i32;
    println!("{}", count);
    for arg in &arguments {
        println!("{}", arg);
    }
}

