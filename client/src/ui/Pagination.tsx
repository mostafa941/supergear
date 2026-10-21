"use client";
import { useEffect, useState } from "react";
import { config } from "../../config";
import { getData } from "../lib";

import ReactPaginateComponent from "react-paginate";
import type { ProductProps } from "../../type";
import ProductCard from "./ProductCard";

// معالجة مشكلة CommonJS/ESM Interop لـ react-paginate في Vite
const ReactPaginate = ((ReactPaginateComponent as any).default ||
  ReactPaginateComponent) as typeof ReactPaginateComponent;

interface ItemsProps {
  currentItems: ProductProps[];
}

const Items = ({ currentItems }: ItemsProps) => {
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-5">
      {currentItems && currentItems.length > 0 ? (
        currentItems.map((item: ProductProps) => (
          <ProductCard key={item?._id} item={item} />
        ))
      ) : (
        <p className="col-span-full text-center py-5">No products found.</p>
      )}
    </div>
  );
};

const Pagination = () => {
  const [products, setProducts] = useState<ProductProps[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const endpoint = `${config?.baseUrl}/products`;
      try {
        const data = await getData(endpoint);
        setProducts(data || []);
      } catch (error) {
        console.error("Error fetching data", error);
      }
    };
    fetchData();
  }, []);

  const itemsPerPage = 15;
  const [itemOffset, setItemOffset] = useState(0);
  const [itemStart, setItemStart] = useState(1);
  const endOffset = itemOffset + itemsPerPage;
  const currentItems = products.slice(itemOffset, endOffset);
  const pageCount = Math.ceil((products?.length || 0) / itemsPerPage);

  const handlePageClick = (event: { selected: number }) => {
    const newOffset =
      (event.selected * itemsPerPage) % (products?.length || 1);
    const newStart = newOffset + 1;
    setItemOffset(newOffset);
    setItemStart(newStart);
  };

  return (
    <>
      <Items currentItems={currentItems} />
      <div className="flex flex-col md:flex-row justify-center md:justify-between items-center">
        <ReactPaginate
          nextLabel=""
          onPageChange={handlePageClick}
          pageRangeDisplayed={3}
          marginPagesDisplayed={2}
          pageCount={pageCount || 1}
          previousLabel=""
          pageLinkClassName="w-9 h-9 border[1px] border-lightColor hover:border-gray-500 duration-300 flex justify-center items-center"
          pageClassName="mr-6"
          containerClassName="flex text-base font-semibold py-10"
          activeClassName="bg-black text-white"
        />
        <p>
          Products from {products.length > 0 ? itemStart : 0} to{" "}
          {Math.min(endOffset, products?.length || 0)} of {products?.length || 0}
        </p>
      </div>
    </>
  );
};

export default Pagination;