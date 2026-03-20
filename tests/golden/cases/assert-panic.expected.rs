fn main() {
    assert!(true);
    assert!(1 == 1, "{}", String::from("math works"));
    panic!("{}", String::from("unreachable"));
}

