import { AdminInterface, PledgeInterface } from './interfaces';

async function getPledge(liquidPledging, idPledge) {
  const pledge:PledgeInterface = <PledgeInterface>{
    delegates: [],
  };
  const pledgeResult =await liquidPledging
    .getPledge(idPledge)
  pledge.owner = pledgeResult.owner;
  pledge.token = pledgeResult.token;

  if (pledgeResult.intendedProject) {
    pledge.intendedProject = pledgeResult.intendedProject;
    pledge.commmitTime = pledgeResult.commitTime;
  }
  if (pledgeResult.oldPledge) {
    pledge.oldPledge = pledgeResult.oldPledge;
  }
  if (pledgeResult.pledgeState === '0') {
    pledge.pledgeState = 'Pledged';
  } else if (pledgeResult.pledgeState === '1') {
    pledge.pledgeState = 'Paying';
  } else if (pledgeResult.pledgeState === '2') {
    pledge.pledgeState = 'Paid';
  } else {
    pledge.pledgeState = 'Unknown';
  }

  const promises = [];
  for (let i = 1; i <= pledgeResult.nDelegates; i += 1) {
    promises.push(
      liquidPledging.getPledgeDelegate(idPledge, i).then(r => ({
        id: r.idDelegate,
        addr: r.addr,
        name: r.name,
        url: r.url,
      })),
    );
  }
  pledge.delegates = await Promise.all(promises)
  return  pledge
}

async function getAdmin(liquidPledging, idAdmin) {
  const admin :AdminInterface =<AdminInterface> {};
  const res = await liquidPledging.getPledgeAdmin(idAdmin)

  if (res.adminType === '0') {
    admin.type = 'Giver';
  } else if (res.adminType === '1') {
    admin.type = 'Delegate';
  } else if (res.adminType === '2') {
    admin.type = 'Project';
  } else {
    admin.type = 'Unknown';
  }
  admin.addr = res.addr;
  admin.name = res.name;
  admin.url = res.url;
  admin.commitTime = res.commitTime;
  if (admin.type === 'Project') {
    admin.parentProject = res.parentProject;
    admin.canceled = res.canceled;
  }
  admin.plugin = res.plugin;
  return admin;
}

export async function getAdminBatch(liquidPledging, fromPledgeIndex = 1){
  const numberOfAdminPledges =await liquidPledging.numberOfPledgeAdmins();
  console.log("getAdminBatch", {fromPledgeIndex,numberOfAdminPledges})
  const promises =[]
  for (let i = fromPledgeIndex; i<= numberOfAdminPledges; i++){
    promises.push(getAdmin(liquidPledging, i))
  }
  return Promise.all(promises);
}
export async function getPledgeBatch(liquidPledging, fromPledgeIndex = 1){
  const numberOfPledges =await liquidPledging.numberOfPledges();
  console.log("getPledgeBatch", {fromPledgeIndex, numberOfPledges})

  const promises =[]
  for (let i = fromPledgeIndex; i<= numberOfPledges; i++){
    promises.push(getPledge(liquidPledging, i))
  }
  return Promise.all(promises);
}
