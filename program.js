import { createReadStream } from 'fs';
import csv from 'csv-parser';
import { createObjectCsvWriter as createCsvWriter } from 'csv-writer';

// API Documentation: https://imdbapi.dev/

const INPUT_FILE = 'input.csv';
const OUTPUT_FILE = 'output.csv';
const API_URL = 'https://rest.imdbapi.dev/v2/search/titles';

async function fetchIMDBData(title, year) {
  try {
    const query = `${title} ${year && year !== 'N/A' ? year : ''}`.trim();
    const response = await fetch(`${API_URL}?query=${encodeURIComponent(query)}`, {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    return data?.titles?.[0]; // Take first match
  } catch (error) {
    console.error(`Error fetching data for "${title}" (${year}):`, error);
    return null;
  }
}

(async () => {
  const results = [];

  const readStream = createReadStream(INPUT_FILE).pipe(csv());

  for await (const row of readStream) {
    const { Title, Year, type: Type } = row;
    console.log(`Fetching: ${Title} (${Year})`);

    const imdbData = await fetchIMDBData(Title, Year);

    let type;
    switch (imdbData?.type) {
      case 'movie':
        type = 'Movie';
        break;
      case 'tvMiniSeries':
      case 'tvMiniSeries':
      case 'tv_special':
        type = 'TV Series';
        break;
      default:
        type = imdbData?.type;
    }

    results.push({
      Title:  imdbData?.primary_title || Title,
      Year:   imdbData?.start_year || Year,
      Type:   type || Type,
      Rating: imdbData?.rating?.aggregate_rating || '',
      Votes:  imdbData?.rating?.votes_count || '',
      Link:   imdbData?.id ? `https://www.imdb.com/title/${imdbData.id}/` : '',
    });
  }

  const csvWriter = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
      { id: 'Title', title: 'Title' },
      { id: 'Year', title: 'Year' },
      { id: 'Type', title: 'Type' },
      { id: 'Rating', title: 'Rating' },
      { id: 'Votes', title: 'Votes' },
      { id: 'Link', title: 'Link' },
    ]
  });

  await csvWriter.writeRecords(results);
  console.log(`✅ Done! Output written to ${OUTPUT_FILE}`);
})();
