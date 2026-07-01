import { TABLE_PAGE_SIZE } from '../../utils/employeeListHelpers.jsx';

export default function Pagination({ currentPage, totalPages, filteredLength, setCurrentPage, variant = 'table' }) {
  if (totalPages <= 1) return null;

  const isTable = variant === 'table';

  return (
    <div className={isTable
      ? 'flex items-center justify-between px-4 py-3 border-t border-gray-100 sticky bottom-0 bg-white z-[5]'
      : 'flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 px-2 py-3 border-t border-gray-100 bg-white rounded-b-2xl'
    }>
      <p className={`text-sm text-gray-500 ${!isTable ? 'text-center sm:text-left' : ''}`}>
        Showing {(currentPage - 1) * TABLE_PAGE_SIZE + (filteredLength === 0 ? 0 : 1)}–
        {Math.min(currentPage * TABLE_PAGE_SIZE, filteredLength)} of {filteredLength} employees
      </p>
      <div className={`flex items-center gap-1 flex-wrap ${!isTable ? 'justify-center' : 'justify-end'}`}>
        <button
          type="button"
          onClick={() => setCurrentPage(1)}
          disabled={currentPage === 1}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
        >
          «
        </button>
        <button
          type="button"
          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
          disabled={currentPage === 1}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
        >
          ‹ Prev
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          let page;
          if (totalPages <= 5) {
            page = i + 1;
          } else if (currentPage <= 3) {
            page = i + 1;
          } else if (currentPage >= totalPages - 2) {
            page = totalPages - 4 + i;
          } else {
            page = currentPage - 2 + i;
          }
          return (
            <button
              key={page}
              type="button"
              onClick={() => setCurrentPage(page)}
              className={`w-8 h-8 text-xs rounded-lg border transition-colors ${
                currentPage === page
                  ? 'bg-[#1B6B6B] text-white border-[#1B6B6B]'
                  : 'border-gray-200 hover:bg-gray-50 text-gray-600'
              }`}
            >
              {page}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
          disabled={currentPage === totalPages}
          className="px-3 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
        >
          Next ›
        </button>
        <button
          type="button"
          onClick={() => setCurrentPage(totalPages)}
          disabled={currentPage === totalPages}
          className="px-2 py-1.5 text-xs rounded-lg border border-gray-200 disabled:opacity-30 hover:bg-gray-50"
        >
          »
        </button>
      </div>
    </div>
  );
}
