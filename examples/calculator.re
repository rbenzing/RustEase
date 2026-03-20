enum Operation
    Add
    Subtract
    Multiply
    Divide
end

function calculate(a, b, op)
    match op
        Operation.Add => return a + b
        Operation.Subtract => return a - b
        Operation.Multiply => return a * b
        Operation.Divide => return a / b
    end
end

function main()
    result = calculate(10.0, 3.0, Operation.Add)
    print("10 + 3 = {result}")
    result = calculate(10.0, 3.0, Operation.Subtract)
    print("10 - 3 = {result}")
    result = calculate(10.0, 3.0, Operation.Multiply)
    print("10 * 3 = {result}")
    result = calculate(10.0, 3.0, Operation.Divide)
    print("10 / 3 = {result}")
end

