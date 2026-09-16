const rawSampleData = require("../init/data.js").data;

const sampleListings = (rawSampleData || []).map((item, index) => {
  const hex = (index + 1).toString(16).padStart(24, "0");
  return {
    _id: hex,
    id: hex,
    ...item,
    reviews: [],
    owner: {
      _id: "000000000000000000000001",
      username: "voyager_host",
      email: "host@voyager.com",
    },
  };
});

let inMemoryListings = [...sampleListings];

module.exports = {
  getListings: () => [...inMemoryListings],
  getListingById: (id) =>
    inMemoryListings.find(
      (l) => String(l._id) === String(id) || String(l.id) === String(id)
    ) || null,
  addListing: (listingData) => {
    const hex = (inMemoryListings.length + 1).toString(16).padStart(24, "0");
    const newListing = {
      _id: hex,
      id: hex,
      ...listingData,
      reviews: [],
      owner: {
        _id: "000000000000000000000001",
        username: "voyager_host",
        email: "host@voyager.com",
      },
    };
    inMemoryListings.unshift(newListing);
    return newListing;
  },
  updateListing: (id, updateData) => {
    const idx = inMemoryListings.findIndex(
      (l) => String(l._id) === String(id) || String(l.id) === String(id)
    );
    if (idx !== -1) {
      inMemoryListings[idx] = { ...inMemoryListings[idx], ...updateData };
      return inMemoryListings[idx];
    }
    return null;
  },
  deleteListing: (id) => {
    const idx = inMemoryListings.findIndex(
      (l) => String(l._id) === String(id) || String(l.id) === String(id)
    );
    if (idx !== -1) {
      return inMemoryListings.splice(idx, 1)[0];
    }
    return null;
  },
};
