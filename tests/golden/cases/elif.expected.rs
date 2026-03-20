fn classify(x: i32) {
    if x > 0 {
        println!("{}", String::from("positive"));
    } else if x < 0 {
        println!("{}", String::from("negative"));
    } else {
        println!("{}", String::from("zero"));
    }
}

fn main() {
    classify(5);
    classify(-3);
    classify(0);
}


