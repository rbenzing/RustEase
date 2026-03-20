function main()
    text = "the cat sat on the mat the cat"
    words = text.split(" ")
    counts = {}
    for word in words
        if counts.contains(word)
            count = counts[word]
            counts[word] = count + 1
        else
            counts[word] = 1
        end
    end
    for word in words
        count = counts[word]
        print("{word}: {count}")
    end
end

