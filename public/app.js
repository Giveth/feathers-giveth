const socket = io();
const client = feathers();

// Create the Feathers application with a `socketio` connection
client.configure(feathers.socketio(socket));

// Get the service for our `milestones` endpoint
const milestones = client.service('milestones');

// Add a new milestone to the list
const milestonesBox = document.querySelector('#milestones-box');
// Add a new milestone to the list
const listMilestoneNamesBox = document.querySelector('#list-milestone-names-box');

// Dictionary of milestones by id
let milestonesById = {}
let milestonesByName = {}
// List to store milestones ids for reference
let milestoneIds = []

function addMilestone(milestone) {
  // Add milestone to ui
  milestonesBox.insertAdjacentHTML('beforeend', `<div class="milestone" id="ms_${milestone._id}">
      ${milestone.name} has <span class="milestone-amount">0</span> eth total
  </div>`);
  listMilestoneNamesBox.insertAdjacentHTML('beforeend', `<div class="milestone"">
      ${milestone.name}
  </div>`);
  milestonesBox.scrollTop = milestonesBox.scrollHeight - milestonesBox.clientHeight;
  milestonesById[milestone._id] = milestone
  milestonesByName[milestone.name] = milestone
  milestoneIds.push(milestone._id)
}

// Get all milestones from feathers db and add them to page
milestones.find().then(page => page.data.forEach(addMilestone));
milestones.on('created', addMilestone);

// Create new milestone from user inputs
const nameInput = document.querySelector('[name="name"]');
const goalInput = document.querySelector('[name="goal"]');
const deadlineInput = document.querySelector('[name="deadline"]');
const ownerInput = document.querySelector('[name="owner"]');
const reviewerInput = document.querySelector('[name="reviewer"]');

function makeid() {
  var text = "";
  var possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  for (var i = 0; i < 4; i++)
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  return text;
}

function fillField(inputValue) {
  return inputValue == '' ? makeid() : inputValue
}

// Add event listener to create a new milestone and then clear the input fields
document.getElementById('create-milestone').addEventListener('click', function(ev) {
  client.service('milestones').create({
    name: fillField(nameInput.value),
    goal: fillField(goalInput.value),
    deadline: new Date(deadlineInput.value == '' ? '2017-08-02' : deadlineInput.value),
    owner: fillField(ownerInput.value),
    reviewer: fillField(reviewerInput.value),
    eth_address: 'may_start_off_empty',
    requirements: [],
    evidence: []
  }).then(() => {
    nameInput.value = '';
    goalInput.value = '';
    deadlineInput.value = '';
    ownerInput.value = '';
    reviewerInput.value = '';
  });
  ev.preventDefault();
});

// Get the service for our `donations` endpoint
const donations = client.service('donations');

// Add a new donation to the list
const donationsBox = document.querySelector('#donations-box');

// Dictionary milestone totals
let milestoneToAmount = {}

function addDonation(donation) {
  let milestone = milestonesById[donation.milestoneId]
  donationsBox.insertAdjacentHTML('beforeend', `<div class="donation">
      <p>${donation.amount} eth to ${milestone.name} milestone</p>
  </div>`);
  donationsBox.scrollTop = donationsBox.scrollHeight - donationsBox.clientHeight;
  if (donation.milestoneId in milestoneToAmount) {
    milestoneToAmount[donation.milestoneId] += donation.amount
  } else {
    milestoneToAmount[donation.milestoneId] = donation.amount
  }
  $('#ms_' + donation.milestoneId + ' > .milestone-amount').html(milestoneToAmount[donation.milestoneId])

}

// Get all donations from feathers db and add them to page
donations.find().then(page => page.data.forEach(addDonation));
donations.on('created', addDonation);

// Create new donation from user inputs
const giverAddressInput = document.querySelector('[name="giver-address"]');
const milestoneNameInput = document.querySelector('[name="milestone-name"]');
const donationAmountInput = document.querySelector('[name="donation-amount"]');

function fillAmount(inputValue) {
  return (inputValue == '' || isNaN(inputValue)) ? Math.floor(Math.random() * 10) + 1 : Number(inputValue)
}

function fillMilestoneId(inputValue) {
  if (inputValue && inputValue in milestonesByName) { return milestonesByName[inputValue]._id; }
  return milestoneIds[Math.floor(Math.random() * milestoneIds.length)];
}

// Add event listener to create a new donation and then clear the input fields
document.getElementById('create-donation').addEventListener('click', function(ev) {
  client.service('donations').create({
    giverAddress: fillField(giverAddressInput.value),
    milestoneId: fillMilestoneId(milestoneNameInput.value),
    amount: fillAmount(donationAmountInput.value)
  }).then(() => {
    giverAddressInput.value = '';
    milestoneNameInput.value = '';
    donationAmountInput.value = '';
  });
  ev.preventDefault();
});
