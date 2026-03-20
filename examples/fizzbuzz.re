function fizzbuzz(n)
    i = 1
    while i <= n
        if i == 15
            print("FizzBuzz")
        else if i == 3
            print("Fizz")
        else if i == 5
            print("Buzz")
        else
            print(i)
        end
        i = i + 1
    end
end

function main()
    fizzbuzz(15)
end


