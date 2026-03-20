fn main() {
    if std::env::args().count() as i32 < 2 {
        println!("{}", String::from("Usage: task-manager <command> [args]"));
        println!("{}", String::from("Commands: add, list, done, remove"));
    } else {
        let all_args: Vec<String> = std::env::args().collect::<Vec<String>>();
        let command: String = all_args[1 as usize];
        let filename: String = String::from("tasks.txt");
        if command == String::from("add") {
            if std::env::args().count() as i32 < 3 {
                println!("{}", String::from("Usage: task-manager add <description>"));
            } else {
                let description: String = all_args[2 as usize];
                let task_line: String = format!("{}{}", format!("{}{}", String::from("[ ] "), description), String::from("\n"));
                if std::path::Path::new(&filename).exists() {
                    {
                        use std::io::Write;
                        let mut file = std::fs::OpenOptions::new().append(true).create(true).open(filename).unwrap();
                        file.write_all(task_line.as_bytes()).unwrap();
                    }
                } else {
                    std::fs::write(filename, task_line).unwrap();
                }
                println!("Task added: {}", description);
            }
        } else if command == String::from("list") {
            if !std::path::Path::new(&filename).exists() {
                println!("{}", String::from("No tasks yet. Use 'add' to create one."));
            } else {
                let mut content: String = std::fs::read_to_string(filename).unwrap();
                let mut lines: Vec<String> = content.split(String::from("\n").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
                let mut count: i32 = 0;
                for line in &lines {
                    if line.starts_with(String::from("[ ] ").as_str()) {
                        count = count + 1;
                        let mut task: String = line.replace(String::from("[ ] ").as_str(), String::from("").as_str());
                        println!("{}. [ ] {}", count, task);
                    } else if line.starts_with(String::from("[x] ").as_str()) {
                        count = count + 1;
                        task = line.replace(String::from("[x] ").as_str(), String::from("").as_str());
                        println!("{}. [x] {}", count, task);
                    }
                }
                if count == 0 {
                    println!("{}", String::from("No tasks yet. Use 'add' to create one."));
                }
            }
        } else if command == String::from("done") {
            if std::env::args().count() as i32 < 3 {
                println!("{}", String::from("Usage: task-manager done <task_number>"));
            } else {
                let mut task_num: i32 = all_args[2 as usize].parse::<i32>().unwrap();
                if !std::path::Path::new(&filename).exists() {
                    println!("{}", String::from("No tasks found."));
                } else {
                    content = std::fs::read_to_string(filename).unwrap();
                    lines = content.split(String::from("\n").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
                    let mut new_content: String = String::from("");
                    let mut i: i32 = 0;
                    for line in &lines {
                        if line.starts_with(String::from("[ ] ").as_str()) || line.starts_with(String::from("[x] ").as_str()) {
                            i = i + 1;
                            if i == task_num {
                                new_content = format!("{}{}", format!("{}{}", new_content, line.replace(String::from("[ ] ").as_str(), String::from("[x] ").as_str())), String::from("\n"));
                            } else {
                                new_content = format!("{}{}", format!("{}{}", new_content, line), String::from("\n"));
                            }
                        }
                    }
                    std::fs::write(filename, new_content).unwrap();
                    println!("Task {} marked as done.", task_num);
                }
            }
        } else if command == String::from("remove") {
            if std::env::args().count() as i32 < 3 {
                println!("{}", String::from("Usage: task-manager remove <task_number>"));
            } else {
                task_num = all_args[2 as usize].parse::<i32>().unwrap();
                if !std::path::Path::new(&filename).exists() {
                    println!("{}", String::from("No tasks found."));
                } else {
                    content = std::fs::read_to_string(filename).unwrap();
                    lines = content.split(String::from("\n").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
                    new_content = String::from("");
                    i = 0;
                    for line in &lines {
                        if line.starts_with(String::from("[ ] ").as_str()) || line.starts_with(String::from("[x] ").as_str()) {
                            i = i + 1;
                            if i != task_num {
                                new_content = format!("{}{}", format!("{}{}", new_content, line), String::from("\n"));
                            }
                        }
                    }
                    std::fs::write(filename, new_content).unwrap();
                    println!("Task {} removed.", task_num);
                }
            }
        } else {
            println!("Unknown command: {}", command);
            println!("{}", String::from("Commands: add, list, done, remove"));
        }
    }
}
