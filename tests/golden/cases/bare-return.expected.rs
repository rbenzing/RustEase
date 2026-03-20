fn check(x: i32) {
    if x < 0 {
        return;
    }
    println!("{}", String::from("positive"));
}

fn main() {
    check(5);
    check(-1);
}


