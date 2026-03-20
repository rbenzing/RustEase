function main()
    if args_count() < 2
        print("Usage: task-manager <command> [args]")
        print("Commands: add, list, done, remove")
    else
        all_args = args()
        command = all_args[1]
        filename = "tasks.txt"

        if command == "add"
            if args_count() < 3
                print("Usage: task-manager add <description>")
            else
                description = all_args[2]
                task_line = "[ ] " + description + "\n"
                if file_exists(filename)
                    append_file(filename, task_line)
                else
                    write_file(filename, task_line)
                end
                print("Task added: {description}")
            end
        else if command == "list"
            if not file_exists(filename)
                print("No tasks yet. Use 'add' to create one.")
            else
                content = read_file(filename)
                lines = content.split("\n")
                count = 0
                for line in lines
                    if line.starts_with("[ ] ")
                        count += 1
                        task = line.replace("[ ] ", "")
                        print("{count}. [ ] {task}")
                    else if line.starts_with("[x] ")
                        count += 1
                        task = line.replace("[x] ", "")
                        print("{count}. [x] {task}")
                    end
                end
                if count == 0
                    print("No tasks yet. Use 'add' to create one.")
                end
            end
        else if command == "done"
            if args_count() < 3
                print("Usage: task-manager done <task_number>")
            else
                task_num = int(all_args[2])
                if not file_exists(filename)
                    print("No tasks found.")
                else
                    content = read_file(filename)
                    lines = content.split("\n")
                    new_content = ""
                    i = 0
                    for line in lines
                        if line.starts_with("[ ] ") or line.starts_with("[x] ")
                            i += 1
                            if i == task_num
                                new_content = new_content + line.replace("[ ] ", "[x] ") + "\n"
                            else
                                new_content = new_content + line + "\n"
                            end
                        end
                    end
                    write_file(filename, new_content)
                    print("Task {task_num} marked as done.")
                end
            end
        else if command == "remove"
            if args_count() < 3
                print("Usage: task-manager remove <task_number>")
            else
                task_num = int(all_args[2])
                if not file_exists(filename)
                    print("No tasks found.")
                else
                    content = read_file(filename)
                    lines = content.split("\n")
                    new_content = ""
                    i = 0
                    for line in lines
                        if line.starts_with("[ ] ") or line.starts_with("[x] ")
                            i += 1
                            if i != task_num
                                new_content = new_content + line + "\n"
                            end
                        end
                    end
                    write_file(filename, new_content)
                    print("Task {task_num} removed.")
                end
            end
        else
            print("Unknown command: {command}")
            print("Commands: add, list, done, remove")
        end
    end
end

