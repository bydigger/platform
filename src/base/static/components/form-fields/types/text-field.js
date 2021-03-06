import React from "react";
import PropTypes from "prop-types";
import classNames from "classnames";

import "./text-field.scss";

const TextField = props => {
  const cn = classNames("text-field", {
    "text-field--has-autofill": props.hasAutofill,
  });

  return (
    <input
      className={cn}
      name={props.name}
      type="text"
      value={props.value}
      placeholder={props.placeholder}
      onChange={e => props.onChange(e.target.name, e.target.value)}
    />
  );
};

TextField.propTypes = {
  hasAutofill: PropTypes.bool,
  name: PropTypes.string.isRequired,
  onChange: PropTypes.func.isRequired,
  placeholder: PropTypes.string,
  value: PropTypes.string,
};

export default TextField;
