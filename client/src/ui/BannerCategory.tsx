import { useEffect, useState } from "react";
import { getData } from "../lib";
import { config } from "../../config";
import type { CategoryProps } from "../../type";
import { Link } from "react-router-dom";


import ReactMultiCarousel from 'react-multi-carousel';
import 'react-multi-carousel/lib/styles.css';

const Carousel = (ReactMultiCarousel as any).default || ReactMultiCarousel;

const responsive = {
  superLargeDesktop: {
    breakpoint: { max: 4000, min: 3000 },
    items: 5,
  },
  desktop: {
    breakpoint: { max: 3000, min: 1024 },
    items: 3,
  },
  tablet: {
    breakpoint: { max: 1024, min: 464 },
    items: 2,
  },
  mobile: {
    breakpoint: { max: 464, min: 0 },
    items: 1,
  },
};

function BannerCategory() {
  const [categories, setCategories] = useState<CategoryProps[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const enpoint = `${config?.baseUrl}/categories`;
      try {
        const data = await getData(enpoint);
        setCategories(data || []);
      } catch (error) {
        console.log("Error Fetching data", error);
      }
    };

    fetchData();
  }, []);

  return (
    <Carousel
      responsive={responsive}
      infinite={true}
      autoPlay={true}
      transitionDuration={1000}
      className="flex flex-row p-4 max-w-280 mx-auto lg:px-0 relative"
    >
      {categories.map((item: CategoryProps) => (
        <Link key={item?._id} to={`/category/${item?._base}`}
        className="flex items-center gap-x-2 pl-1 border py-2 border-gray-100 mr-1 flex-1 rounded-md hover:border-skyText hover:shadow-md"
        >
          <img src={item?.image} alt="CategoryItem" className="w-10 h-10 object-cover" />
          <p className="font-bold text-sm">{item?.name}</p>
        </Link>
      ))}
    </Carousel>
  );
}

export default BannerCategory;