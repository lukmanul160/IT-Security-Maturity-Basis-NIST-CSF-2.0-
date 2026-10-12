export function applyStandingPose(avatar, swing = 0) {
  avatar.group.rotation.set(0, avatar.group.rotation.y, 0);
  avatar.group.position.y = 0;
  avatar.upper.position.y = 0;
  avatar.upper.rotation.set(0, 0, 0);
  avatar.body.rotation.set(0, 0, 0);
  avatar.body.position.y = 1.12;
  avatar.eyes.forEach(eye => { eye.scale.y = .025; });
  avatar.arms.forEach(arm => {
    arm.position.y = 1.38;
    arm.rotation.set(0,0,0); arm.elbow.rotation.set(0,0,0);
    arm.forearm.scale.y = .3; arm.forearm.position.y = -.15; arm.hand.position.y = -.33;
  });
  avatar.legs.forEach((leg, index) => {
    leg.pivot.position.y = .82;
    leg.pivot.rotation.set(index ? -swing : swing, 0, 0);
    leg.knee.rotation.set(0, 0, 0);
    leg.shin.scale.y = .38;
    leg.shin.position.y = -.19;
    leg.foot.position.set(0, -.4, -.055);
  });
  if (avatar.skirtMesh) { avatar.skirtMesh.position.set(0, .73, 0); avatar.skirtMesh.rotation.set(0,0,0); avatar.skirtMesh.scale.y = .4; }
}

export function applySeatedPose(avatar) {
  // Reset every root axis, including any previous sleeping or walking pose.
  avatar.group.rotation.set(0, 0, 0);
  avatar.group.position.y = 0;
  avatar.upper.position.y = 0;
  avatar.upper.rotation.set(0, 0, 0);
  avatar.body.rotation.set(0, 0, 0);
  avatar.body.position.y = 1.12;
  avatar.eyes.forEach(eye => { eye.scale.y = .025; });
  avatar.legs.forEach(leg => {
    leg.pivot.position.y = .78;
    leg.pivot.rotation.set(Math.PI / 2, 0, 0);
    leg.knee.rotation.set(-Math.PI / 2, 0, 0);
    leg.shin.scale.y = .64;
    leg.shin.position.y = -.32;
    leg.foot.position.set(0, -.64, -.055);
  });
  if (avatar.skirtMesh) { avatar.skirtMesh.position.set(0,.78,-.1); avatar.skirtMesh.rotation.set(0,0,0); avatar.skirtMesh.scale.y = .2; }
  avatar.arms.forEach(arm => {
    arm.rotation.set(.1,0,0); arm.position.y = 1.38; arm.elbow.rotation.set(.3,0,0);
    arm.forearm.scale.y = .3; arm.forearm.position.y = -.15; arm.hand.position.y = -.33;
  });
  avatar.name.material.rotation = 0;
}

export function applyWorkingPose(avatar, desk, time) {
  applySeatedPose(avatar);
  avatar.pos.set(desk.x, 0, desk.z + 1.0);
  avatar.arms.forEach((arm,index) => {
    const angle = 1.32 + Math.sin(time * 7 + index) * .025;
    arm.rotation.x = angle; arm.elbow.rotation.x = Math.PI / 2 - angle;
    arm.forearm.scale.y = .44; arm.forearm.position.y = -.22; arm.hand.position.y = -.47;
  });
}
