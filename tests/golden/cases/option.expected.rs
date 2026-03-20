fn main() {
    let maybe: Option<i32> = Some(42);
    if maybe.is_some() {
        let val: i32 = maybe.unwrap();
        println!("{}", val);
    }
    let empty = None;
    let fallback = empty.unwrap_or(0);
    println!("{}", fallback);
}

