function main()
    todos = []
    count = 0
    print("=== Todo List ===")
    while true
        action = prompt("Command (add/list/quit): ")
        if action == "add"
            item = prompt("Enter todo: ")
            todos.push(item)
            count += 1
            print("Added! Total: {count}")
        else if action == "list"
            if length(todos) == 0
                print("No todos yet!")
            else
                i = 0
                for todo in todos
                    i += 1
                    print("{i}. {todo}")
                end
            end
        else if action == "quit"
            print("Bye!")
            break
        else
            print("Unknown command")
        end
    end
end

