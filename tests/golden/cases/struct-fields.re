struct Point
  x: int
  y: int
end

function main()
  p = Point { x: 1, y: 2 }
  print(p.x)
  p.x = 10
  print(p.x)
end


