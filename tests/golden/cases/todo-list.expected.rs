use std::io;
use std::io::Write;

fn main() {
    let mut todos = vec![];
    let mut count: i32 = 0;
    println!("{}", String::from("=== Todo List ==="));
    while true {
        let action: String = {
            print!("{}", String::from("Command (add/list/quit): "));
            std::io::Write::flush(&mut std::io::stdout()).unwrap();
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            input.trim().to_string()
        };
        if action == String::from("add") {
            let item: String = {
                print!("{}", String::from("Enter todo: "));
                std::io::Write::flush(&mut std::io::stdout()).unwrap();
                let mut input = String::new();
                std::io::stdin().read_line(&mut input).unwrap();
                input.trim().to_string()
            };
            todos.push(item);
            count = count + 1;
            println!("Added! Total: {}", count);
        } else if action == String::from("list") {
            if todos.len() == 0 {
                println!("{}", String::from("No todos yet!"));
            } else {
                let mut i: i32 = 0;
                for todo in &todos {
                    i = i + 1;
                    println!("{}. {}", i, todo);
                }
            }
        } else if action == String::from("quit") {
            println!("{}", String::from("Bye!"));
            break;
        } else {
            println!("{}", String::from("Unknown command"));
        }
    }
}

