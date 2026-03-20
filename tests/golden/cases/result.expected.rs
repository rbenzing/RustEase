fn main() {
    let success: Result<i32, String> = Ok(100);
    if success.is_ok() {
        let v: i32 = success.unwrap();
        println!("{}", v);
    }
    let failure = Err(String::from("oops"));
    if failure.is_err() {
        println!("{}", String::from("got error"));
    }
}

