exports.onEnd = (result, cb) => {
  cb(result);
};

exports.onFind = ({ err, doc }, cb) => {
  if (err) {
    cb({ err });
    return;
  }
  if (!doc) {
    cb({ err: 'result not found' });
    return;
  }
  cb(doc.resBody);
};
