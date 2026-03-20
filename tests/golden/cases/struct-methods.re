struct Circle
  radius: float
end

impl Circle
  function area() -> float
    return 3.14159 * self.radius * self.radius
  end

  function scale(factor: float)
    self.radius = self.radius * factor
  end
end

function main()
  c = Circle { radius: 5.0 }
  a = c.area()
  print(a)
  c.scale(2.0)
  a2 = c.area()
  print(a2)
end


