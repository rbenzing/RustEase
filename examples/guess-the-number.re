function main()
    secret = 42
    attempts = 0
    print("Guess the number (1-100)!")
    while true
        input = prompt("Your guess: ")
        guess = int(input)
        attempts += 1
        if guess < secret
            print("Too low!")
        else if guess > secret
            print("Too high!")
        else
            print("Correct! You got it in {attempts} attempts!")
            break
        end
    end
end

