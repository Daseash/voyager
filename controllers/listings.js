const mongoose = require("mongoose");
const listing = require("../models/listing.js");
const User = require("../models/user.js");
const inMemoryStore = require("../utils/inMemoryStore.js");
const ExpressError = require("../utils/ExpressError.js");
const { getSessionUserId } = require("../utils/auth.js");
const { refreshListingChunks, removeListingChunks } = require("../rag/sync.js");
const { bookedRangesForListing } = require("./bookings.js");
const { attachRatings } = require("../utils/rating.js");

// Wishlist ids for the logged-in user, if any.
async function wishlistIdsFor(req) {
  const uid = getSessionUserId(req);
  if (!uid || mongoose.connection.readyState !== 1) return new Set();
  try {
    const user = await User.findById(uid).select("wishlist").lean();
    return new Set((user && user.wishlist || []).map((x) => String(x)));
  } catch {
    return new Set();
  }
}

// Index Controller — keyword + price-range + sort + (optional) date/guest hints.
module.exports.index = async (req, res) => {
  const {
    search = "",
    category = "",
    checkin = "",
    checkout = "",
    guests = "",
    minPrice = "",
    maxPrice = "",
    sort = "",
  } = req.query;

  const query = {};
  if (category && category !== "all") {
    const catClean = category.replace(/[^a-zA-Z0-9-]/g, "");
    const kwRegex = new RegExp(catClean.replace(/-/g, "|"), "i");
    query.$or = [
      { category: catClean },
      { title: kwRegex },
      { description: kwRegex },
      { location: kwRegex },
      { country: kwRegex },
    ];
  }
  if (search) {
    const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const searchClause = {
      $or: [
        { title: rx },
        { description: rx },
        { location: rx },
        { country: rx },
        { category: rx },
      ],
    };
    if (query.$or) {
      query.$and = [{ $or: query.$or }, searchClause];
      delete query.$or;
    } else {
      query.$or = searchClause.$or;
    }
  }
  const min = Number(minPrice);
  const max = Number(maxPrice);
  if (Number.isFinite(min) && min > 0) query.price = { $gte: min };
  if (Number.isFinite(max) && max > 0) query.price = { ...(query.price || {}), $lte: max };

  let allListings = [];
  if (mongoose.connection.readyState === 1) {
    try {
      let cursor = listing.find(query);
      if (sort === "price_asc") cursor = cursor.sort({ price: 1 });
      else if (sort === "price_desc") cursor = cursor.sort({ price: -1 });
      else if (sort === "newest") cursor = cursor.sort({ _id: -1 });
      allListings = await cursor;
    } catch {
      allListings = inMemoryStore.getListings();
    }
  } else {
    allListings = inMemoryStore.getListings().filter((item) => {
      if (category && category !== "all") {
        const catClean = category.toLowerCase().replace(/[^a-z0-9-]/g, "");
        const matchesCat =
          String(item.category || "").toLowerCase() === catClean ||
          new RegExp(catClean.replace(/-/g, "|"), "i").test(
            `${item.title} ${item.description} ${item.location} ${item.country}`
          );
        if (!matchesCat) return false;
      }
      if (search) {
        const rx = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        if (!rx.test(`${item.title} ${item.description} ${item.location} ${item.country} ${item.category}`)) {
          return false;
        }
      }
      if (Number.isFinite(min) && min > 0 && item.price < min) return false;
      if (Number.isFinite(max) && max > 0 && item.price > max) return false;
      return true;
    });
    if (sort === "price_asc") allListings.sort((a, b) => a.price - b.price);
    else if (sort === "price_desc") allListings.sort((a, b) => b.price - a.price);
  }

  await attachRatings(allListings);
  const wishlistSet = await wishlistIdsFor(req);
  res.render("listings/index", {
    allListings,
    searchTerm: search,
    selectedCategory: category,
    checkin,
    checkout,
    guests,
    filters: { minPrice: minPrice, maxPrice: maxPrice, sort },
    wishlistSet,
  });
};

// Render New Listing Form Controller
module.exports.renderNewForm = (req, res) => {
  res.render("listings/new", {
    pageTitle: "Add a New Stay — Become a Host | WanderLust",
  });
};

// Show Listing Controller — details, reviews, availability, wishlist state.
module.exports.showListing = async (req, res) => {
  let { id } = req.params;
  let Listing = null;
  if (mongoose.connection.readyState === 1) {
    try {
      Listing = await listing
        .findById(id)
        .populate({ path: "reviews", populate: { path: "author" } })
        .populate("owner");
    } catch {
      Listing = inMemoryStore.getListingById(id);
    }
  } else {
    Listing = inMemoryStore.getListingById(id);
  }

  if (!Listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }
  let bookedRanges = [];
  try {
    bookedRanges = await bookedRangesForListing(id);
  } catch {
    bookedRanges = [];
  }
  const wishlistSet = await wishlistIdsFor(req);
  const err = req.query.error || "";
  const defaultCheckIn = req.query.from || "";
  const defaultCheckOut = req.query.to || "";

  let similar = [];
  if (mongoose.connection.readyState === 1) {
    try {
      similar = await listing
        .find({ _id: { $ne: Listing._id }, country: Listing.country })
        .limit(5);
    } catch {
      similar = inMemoryStore.getListings().slice(0, 4);
    }
  } else {
    similar = inMemoryStore.getListings().filter((l) => String(l._id) !== String(Listing._id)).slice(0, 4);
  }
  await attachRatings(similar);

  res.render("listings/show", {
    pageTitle: `${Listing.title} — ${Listing.location}, ${Listing.country} | Voyager`,
    Listing,
    bookedRanges,
    wishlistSet,
    err,
    defaultCheckIn,
    defaultCheckOut,
    similarListings: similar,
  });
};

// Create Listing Controller - Save new listing with owner and image upload
module.exports.createListing = async (req, res) => {
  let listingData = req.body.listing || {};
  let image = { url: "https://images.unsplash.com/photo-1552733407-5d5c46c3bb3b", filename: "listingimage" };

  if (req.file) {
    let url = req.file.path && req.file.path.startsWith("http")
      ? req.file.path
      : `/uploads/${req.file.filename}`;
    let filename = req.file.filename;
    image = { url, filename };
  } else if (typeof listingData.image === "string" && listingData.image.trim()) {
    image = { url: listingData.image.trim(), filename: "listingimage" };
  }

  if (mongoose.connection.readyState === 1) {
    let newListing = new listing(listingData);
    newListing.owner = req.user ? req.user._id : getSessionUserId(req);
    newListing.image = image;
    await newListing.save();
    try { await refreshListingChunks(newListing); } catch {}
    req.flash("success", "New Stay Created Successfully!");
    return res.redirect(`/listings/${newListing._id}`);
  } else {
    const created = inMemoryStore.addListing({
      ...listingData,
      image,
    });
    req.flash("success", "New Stay Created Successfully!");
    return res.redirect(`/listings/${created._id}`);
  }
};

// Render Edit Listing Form Controller
module.exports.renderEditForm = async (req, res) => {
  let { id } = req.params;
  let Listing = null;
  if (mongoose.connection.readyState === 1) {
    try { Listing = await listing.findById(id); } catch {}
  }
  if (!Listing) {
    Listing = inMemoryStore.getListingById(id);
  }
  if (!Listing) {
    req.flash("error", "Listing you requested does not exist!");
    return res.redirect("/listings");
  }
  res.render("listings/edit", { Listing });
};

// Update Listing Controller - Modify listing and image upload
module.exports.updateListing = async (req, res) => {
  let { id } = req.params;
  let listingData = req.body.listing || {};

  if (mongoose.connection.readyState === 1) {
    let currentListing = await listing.findById(id);
    if (!currentListing) {
      req.flash("error", "Listing you requested does not exist!");
      return res.redirect("/listings");
    }

    Object.keys(listingData).forEach((key) => {
      if (key !== "image") currentListing[key] = listingData[key];
    });

    if (req.file) {
      let url = req.file.path && req.file.path.startsWith("http")
        ? req.file.path
        : `/uploads/${req.file.filename}`;
      let filename = req.file.filename;
      currentListing.image = { url, filename };
    } else if (typeof listingData.image === "string" && listingData.image.trim()) {
      currentListing.image = { url: listingData.image.trim(), filename: "listingimage" };
    }

    const updated = await currentListing.save();
    if (updated) { try { await refreshListingChunks(updated); } catch {} }
    req.flash("success", "Listing Updated!");
    return res.redirect(`/listings/${id}`);
  } else {
    inMemoryStore.updateListing(id, listingData);
    req.flash("success", "Listing Updated!");
    return res.redirect(`/listings/${id}`);
  }
};

// Destroy Listing Controller - Delete listing & cascade delete reviews
module.exports.destroyListing = async (req, res) => {
  let { id } = req.params;
  if (mongoose.connection.readyState === 1) {
    try {
      let deletedListing = await listing.findByIdAndDelete(id);
      if (!deletedListing) {
        req.flash("error", "Listing you requested does not exist!");
        return res.redirect("/listings");
      }
      try { removeListingChunks(id); } catch {}
    } catch {
      inMemoryStore.deleteListing(id);
    }
  } else {
    inMemoryStore.deleteListing(id);
  }
  req.flash("success", "Listing Deleted!");
  res.redirect("/listings");
};