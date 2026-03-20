function main()
  numbers = [1, 2, 3, 4, 5]

  doubled = numbers.map(|x| x * 2)
  print(doubled)

  evens = numbers.filter(|x| x % 2 == 0)
  print(evens)

  total = numbers.reduce(0, |acc, x| acc + x)
  print(total)

  has_big = numbers.any(|x| x > 3)
  print(has_big)

  all_positive = numbers.all(|x| x > 0)
  print(all_positive)
end


