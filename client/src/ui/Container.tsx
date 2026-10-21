import React from 'react'
import { twMerge } from 'tailwind-merge';
interface Props {
    children : React.ReactNode;
    className? : string;
}
function Container({children , className}:Props) {
    const newClassName = twMerge(
        "max-w-290 mx-auto py-10 px-4 lg:px-0",
        className
    )
  return (
    <div className={newClassName}>{children}</div>
  )
}

export default Container